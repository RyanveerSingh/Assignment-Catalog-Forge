/**
 * Character-level cursor over SQL dump text: comments, quoted strings, identifiers and
 * statement boundaries. It only reads; nothing here interprets SQL. Every method advances the
 * cursor at least one character on progress or reports failure, so callers cannot spin.
 */

const WORD_RE = /^[A-Za-z_\u0080-￿][\w$\u0080-￿]*/;

/** MySQL backslash escapes inside string literals; anything else escapes to the character itself. */
const BACKSLASH_ESCAPES: ReadonlyMap<string, string> = new Map([
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["0", "\0"],
  ["b", "\b"],
  ["Z", "\x1a"],
]);

export class SqlCursor {
  pos = 0;
  /** MySQL treats `\` inside '…' as an escape; Postgres standard strings do not. Set once the dialect is known. */
  backslashEscapes = true;

  constructor(readonly text: string) {}

  eof(): boolean {
    return this.pos >= this.text.length;
  }

  peek(offset = 0): string {
    return this.text[this.pos + offset] ?? "";
  }

  /** Whitespace, `-- …`, `# …` and `/* … *\/` (including MySQL's `/*!40101 … *\/` conditionals). */
  skipSpaceAndComments(): void {
    for (;;) {
      const ch = this.peek();
      if (ch === "") return;
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
        this.pos++;
      } else if ((ch === "-" && this.peek(1) === "-") || ch === "#") {
        this.skipToLineEnd();
      } else if (ch === "/" && this.peek(1) === "*") {
        const end = this.text.indexOf("*/", this.pos + 2);
        this.pos = end === -1 ? this.text.length : end + 2;
      } else {
        return;
      }
    }
  }

  /** The bare word at the cursor, upper-cased, without consuming it; "" when the cursor is not on a word. */
  peekWord(): string {
    const m = WORD_RE.exec(this.text.slice(this.pos, this.pos + 64));
    return m ? m[0].toUpperCase() : "";
  }

  /** Consumes `keyword` (case-insensitive, whole word) after skipping comments; false leaves the cursor where it was. */
  matchKeyword(keyword: string): boolean {
    const start = this.pos;
    this.skipSpaceAndComments();
    if (this.peekWord() === keyword) {
      this.pos += keyword.length;
      return true;
    }
    this.pos = start;
    return false;
  }

  /** Consumes the next bare word and returns it upper-cased, or "" without moving. */
  readWord(): string {
    const word = this.peekWord();
    this.pos += word.length;
    return word;
  }

  /** `name`, "name", `` `name` `` or [name]; null when the cursor is not on an identifier. */
  readIdentifier(): string | null {
    const ch = this.peek();
    if (ch === "`" || ch === '"') return this.readQuoted(ch);
    if (ch === "[") {
      const end = this.text.indexOf("]", this.pos + 1);
      if (end === -1) return null;
      const name = this.text.slice(this.pos + 1, end);
      this.pos = end + 1;
      return name;
    }
    const m = WORD_RE.exec(this.text.slice(this.pos, this.pos + 256));
    if (!m) return null;
    this.pos += m[0].length;
    return m[0];
  }

  /** `schema.table` or `"db"."table"`: returns the last segment, which is the table name. */
  readQualifiedName(): string | null {
    this.skipSpaceAndComments();
    let name = this.readIdentifier();
    if (name === null) return null;
    while (this.peek() === ".") {
      this.pos++;
      const next = this.readIdentifier();
      if (next === null) return null;
      name = next;
    }
    return name;
  }

  /**
   * A string literal at the cursor (on the opening quote). Doubled quotes always unescape;
   * backslash escapes only when `backslashEscapes` (MySQL, or an E'…' literal in Postgres).
   * An unterminated literal runs to the end of the text and sets `unterminated`.
   */
  readString(backslashEscapes: boolean): { value: string; unterminated: boolean } {
    const quote = this.peek();
    const text = this.text;
    let out = "";
    let i = this.pos + 1;
    let runStart = i; // plain characters are copied in runs, not one at a time: dumps are big
    while (i < text.length) {
      const ch = text[i];
      if (ch === quote) {
        if (text[i + 1] === quote) {
          out += text.slice(runStart, i + 1);
          i += 2;
          runStart = i;
          continue;
        }
        this.pos = i + 1;
        return { value: out + text.slice(runStart, i), unterminated: false };
      }
      if (ch === "\\" && backslashEscapes && i + 1 < text.length) {
        const next = text[i + 1];
        out += text.slice(runStart, i) + (BACKSLASH_ESCAPES.get(next) ?? next);
        i += 2;
        runStart = i;
        continue;
      }
      i++;
    }
    this.pos = text.length;
    return { value: out + text.slice(runStart), unterminated: true };
  }

  /** Moves past a quoted region without decoding it. */
  skipQuoted(): void {
    const quote = this.peek();
    const escapes = quote === "'" && this.backslashEscapes;
    let i = this.pos + 1;
    const text = this.text;
    while (i < text.length) {
      const ch = text[i];
      if (ch === quote) {
        if (text[i + 1] === quote) {
          i += 2;
          continue;
        }
        this.pos = i + 1;
        return;
      }
      if (ch === "\\" && escapes) {
        i += 2;
        continue;
      }
      i++;
    }
    this.pos = text.length;
  }

  /** Raw text up to the next top-level `,` `)` or `;`, quote- and paren-aware; used for unquoted values such as `NOW()`. */
  readRawToken(): string {
    const start = this.pos;
    let depth = 0;
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === "'" || ch === '"' || ch === "`") {
        this.skipQuoted();
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") {
        if (depth === 0) break;
        depth--;
      } else if ((ch === "," || ch === ";") && depth === 0) break;
      this.pos++;
    }
    return this.text.slice(start, this.pos).trim();
  }

  /** Skips to just past the next `;` outside quotes and comments. False when the text ended first. */
  skipStatement(): boolean {
    while (!this.eof()) {
      this.skipSpaceAndComments();
      const ch = this.peek();
      if (ch === "") return false;
      if (ch === ";") {
        this.pos++;
        return true;
      }
      if (ch === "'" || ch === '"' || ch === "`") this.skipQuoted();
      else this.pos++;
    }
    return false;
  }

  /** Consumes the rest of the current line (without the newline) and returns it. */
  readLine(): string {
    const end = this.text.indexOf("\n", this.pos);
    const line = end === -1 ? this.text.slice(this.pos) : this.text.slice(this.pos, end);
    this.pos = end === -1 ? this.text.length : end + 1;
    return line;
  }

  skipToLineEnd(): void {
    const end = this.text.indexOf("\n", this.pos);
    this.pos = end === -1 ? this.text.length : end;
  }

  private readQuoted(quote: string): string | null {
    let out = "";
    let i = this.pos + 1;
    const text = this.text;
    while (i < text.length) {
      const ch = text[i];
      if (ch === quote) {
        if (text[i + 1] === quote) {
          out += quote;
          i += 2;
          continue;
        }
        this.pos = i + 1;
        return out;
      }
      out += ch;
      i++;
    }
    return null;
  }
}
