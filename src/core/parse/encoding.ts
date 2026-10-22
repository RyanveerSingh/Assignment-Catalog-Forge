/**
 * Byte-order-mark handling and charset detection for uploaded text files (EC-A4).
 *
 * The decode chain is: BOM → UTF-16 null-byte pattern → strict UTF-8 → jschardet guess
 * restricted to the single-byte Western encodings we trust for EN/DE/FR sheets → windows-1252.
 * Single-byte decodes are repaired so the result never contains U+FFFD.
 */

import iconv from "iconv-lite";
import { detect as chardetDetect } from "jschardet";

export interface DecodedText {
  text: string;
  /** Lower-case IANA-style name of the encoding actually used ("utf-8", "windows-1252", …). */
  encoding: string;
  /** 0–100 */
  confidence: number;
  hadBom: boolean;
}

type SingleByteCodec = "windows1252" | "iso885915";
type Utf16Codec = "utf16le" | "utf16be";

interface SingleByteChoice {
  codec: SingleByteCodec;
  name: string;
}

const WINDOWS_1252: SingleByteChoice = { codec: "windows1252", name: "windows-1252" };
const ISO_8859_15: SingleByteChoice = { codec: "iso885915", name: "iso-8859-15" };

/**
 * jschardet names we act on. ISO-8859-1 is decoded as windows-1252 on purpose: the two agree
 * everywhere except 0x80–0x9F, where 8859-1 has control characters and 1252 has € „ “ – etc.
 * UTF-16 guesses are not trusted here; the null-byte pattern check below is far more reliable.
 */
const TRUSTED_SINGLE_BYTE: ReadonlyMap<string, SingleByteChoice> = new Map([
  ["windows-1252", WINDOWS_1252],
  ["iso-8859-1", WINDOWS_1252],
  ["iso-8859-15", ISO_8859_15],
]);

const UTF16_NAME: Record<Utf16Codec, string> = { utf16le: "utf-16le", utf16be: "utf-16be" };

const MIN_CHARDET_CONFIDENCE = 0.5;
const FALLBACK_CONFIDENCE = 40;
const UTF16_GUESS_CONFIDENCE = 90;
/** jschardet is O(n); a prefix is plenty to classify a sheet. */
const CHARDET_SAMPLE_BYTES = 512 * 1024;
const UTF16_SAMPLE_BYTES = 4096;

export function decodeText(buf: Buffer): DecodedText {
  if (buf.length === 0) return { text: "", encoding: "utf-8", confidence: 100, hadBom: false };

  const bom = readBom(buf);
  if (bom) return decodeWithBom(buf.subarray(bom.length), bom.codec);

  const utf16 = guessUtf16Codec(buf);
  if (utf16) return decodeUtf16(buf, utf16, UTF16_GUESS_CONFIDENCE, false);

  const utf8 = tryStrictUtf8(buf);
  if (utf8 !== null) return { text: utf8, encoding: "utf-8", confidence: 100, hadBom: false };

  return decodeByGuess(buf);
}

// ---------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------

interface Bom {
  codec: "utf8" | Utf16Codec;
  length: number;
}

function readBom(buf: Buffer): Bom | null {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { codec: "utf8", length: 3 };
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { codec: "utf16le", length: 2 };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { codec: "utf16be", length: 2 };
  return null;
}

function decodeWithBom(rest: Buffer, codec: Bom["codec"]): DecodedText {
  if (codec !== "utf8") return decodeUtf16(rest, codec, 100, true);
  const text = tryStrictUtf8(rest);
  if (text !== null) return { text, encoding: "utf-8", confidence: 100, hadBom: true };
  // A UTF-8 BOM on bytes that are not UTF-8: treat the BOM as noise rather than emit U+FFFD.
  return { text: decodeSingleByte(rest, WINDOWS_1252.codec), encoding: WINDOWS_1252.name, confidence: 60, hadBom: true };
}

// ---------------------------------------------------------------------------
// Detection without a BOM
// ---------------------------------------------------------------------------

/**
 * UTF-16 text of Latin script has a zero byte in every other position. This runs before the
 * strict UTF-8 check because NUL bytes are valid UTF-8 and would otherwise pass.
 */
function guessUtf16Codec(buf: Buffer): Utf16Codec | null {
  const n = Math.min(buf.length, UTF16_SAMPLE_BYTES) & ~1;
  if (n < 4) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < n; i += 2) {
    if (buf[i] === 0) evenZeros++;
    if (buf[i + 1] === 0) oddZeros++;
  }
  const pairs = n / 2;
  if (oddZeros / pairs > 0.3 && evenZeros / pairs < 0.05) return "utf16le";
  if (evenZeros / pairs > 0.3 && oddZeros / pairs < 0.05) return "utf16be";
  return null;
}

function tryStrictUtf8(buf: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    return null;
  }
}

function decodeByGuess(buf: Buffer): DecodedText {
  const guess = safeDetect(buf.subarray(0, CHARDET_SAMPLE_BYTES));
  const choice = TRUSTED_SINGLE_BYTE.get(guess.encoding?.toLowerCase() ?? "");
  if (!choice || guess.confidence < MIN_CHARDET_CONFIDENCE) {
    return { text: decodeSingleByte(buf, WINDOWS_1252.codec), encoding: WINDOWS_1252.name, confidence: FALLBACK_CONFIDENCE, hadBom: false };
  }
  const confidence = Math.max(0, Math.min(100, Math.round(guess.confidence * 100)));
  // Bytes 0x80–0x9F are control characters in ISO-8859-15 but printable in windows-1252;
  // real text does not contain C1 controls, so the Windows superset is the safer read.
  const final = choice.codec === "iso885915" && hasC1Bytes(buf) ? WINDOWS_1252 : choice;
  return { text: decodeSingleByte(buf, final.codec), encoding: final.name, confidence, hadBom: false };
}

function safeDetect(buf: Buffer): { encoding: string | null; confidence: number } {
  try {
    const result = chardetDetect(buf);
    return { encoding: result.encoding, confidence: Number.isFinite(result.confidence) ? result.confidence : 0 };
  } catch {
    return { encoding: null, confidence: 0 };
  }
}

function hasC1Bytes(buf: Buffer): boolean {
  const n = Math.min(buf.length, CHARDET_SAMPLE_BYTES);
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b >= 0x80 && b <= 0x9f) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Decoding helpers
// ---------------------------------------------------------------------------

function decodeUtf16(buf: Buffer, codec: Utf16Codec, confidence: number, hadBom: boolean): DecodedText {
  const text = iconv.decode(buf, codec, { stripBOM: false });
  return { text, encoding: UTF16_NAME[codec], confidence, hadBom };
}

/**
 * Single-byte decoding is one character per byte, so any U+FFFD iconv-lite emits (the five
 * code points windows-1252 leaves undefined) can be replaced by the matching C1 control, which
 * is what browsers do and keeps the text lossless.
 */
function decodeSingleByte(buf: Buffer, codec: SingleByteCodec): string {
  const text = iconv.decode(buf, codec, { stripBOM: false });
  if (!text.includes("�")) return text;
  return text.replace(/�/g, (_match, offset: number) => String.fromCharCode(buf[offset]));
}
