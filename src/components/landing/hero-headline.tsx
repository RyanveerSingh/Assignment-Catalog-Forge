"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import { SpotlightText } from "./spotlight-text";

interface Word {
  text: string;
  accent?: boolean;
}

/* Kept as data so each word can rise into place one after another; the browser balances the lines. */
const WORDS: readonly Word[] = [
  { text: "From" },
  { text: "a" },
  { text: "supplier's" },
  { text: "spreadsheet" },
  { text: "to" },
  { text: "a", accent: true },
  { text: "shop", accent: true },
  { text: "that", accent: true },
  { text: "sells.", accent: true },
];

/** The lit copy under the spotlight swaps the two colours: ink words turn orange, orange words turn ink. */
function LitWords() {
  return (
    <>
      {WORDS.map((word, i) => (
        <span key={`${i}-${word.text}`} className={cn("inline-block whitespace-pre", word.accent ? "text-ink italic" : "text-brand")}>
          {word.text}
          {i < WORDS.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/** The headline, word by word: each one rises 0.4 em and fades in, 40 ms after the last. */
export function HeroHeadline() {
  const reduce = useReducedMotion();
  return (
    <SpotlightText lit={<LitWords />}>
      {WORDS.map((word, i) => (
        <motion.span key={`${i}-${word.text}`} className={cn("inline-block whitespace-pre", word.accent && "text-brand italic")} initial={{ opacity: 0, y: "0.4em" }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.55, 0.1 + i * 0.04)}>
          {word.text}
          {i < WORDS.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </SpotlightText>
  );
}
