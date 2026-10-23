"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";

interface Word {
  text: string;
  accent?: boolean;
}

/* Kept as data so each word can rise into place one after another; the browser balances the lines. */
const WORDS: readonly Word[] = [
  { text: "Drop" },
  { text: "in" },
  { text: "a" },
  { text: "supplier" },
  { text: "sheet." },
  { text: "Get" },
  { text: "a" },
  { text: "store-ready", accent: true },
  { text: "catalogue", accent: true },
  { text: "in" },
  { text: "three" },
  { text: "languages." },
];

/** The headline, word by word: each one rises 0.4 em and fades in, 40 ms after the last. */
export function HeroHeadline() {
  const reduce = useReducedMotion();
  return (
    <>
      {WORDS.map((word, i) => (
        <motion.span key={`${i}-${word.text}`} className={cn("inline-block whitespace-pre", word.accent && "text-brand")} initial={{ opacity: 0, y: "0.4em" }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.55, 0.1 + i * 0.04)}>
          {word.text}
          {i < WORDS.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </>
  );
}
