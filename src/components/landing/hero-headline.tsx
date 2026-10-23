"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";

interface Word {
  text: string;
  accent?: boolean;
}

/* Two lines, kept as data so each word can rise into place one after another. */
const LINES: readonly Word[][] = [
  [{ text: "Drop" }, { text: "in" }, { text: "a" }, { text: "supplier" }, { text: "sheet." }],
  [{ text: "Get" }, { text: "a" }, { text: "store-ready", accent: true }, { text: "catalogue", accent: true }, { text: "in" }, { text: "three" }, { text: "languages." }],
];

const EASE = [0.22, 1, 0.36, 1] as const;

/** The headline, word by word: each one rises 0.4 em and fades in, 45 ms after the last. Static under reduced motion. */
export function HeroHeadline() {
  const reduce = useReducedMotion();
  let index = 0;
  return (
    <>
      {LINES.map((line, li) => (
        <span key={li} className="block">
          {line.map((word) => {
            const i = index++;
            return (
              <motion.span
                key={`${li}-${word.text}`}
                className={cn("inline-block whitespace-pre", word.accent && "text-brand")}
                initial={reduce ? false : { opacity: 0, y: "0.4em" }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.08 + i * 0.045, ease: EASE }}
              >
                {word.text}
                {" "}
              </motion.span>
            );
          })}
        </span>
      ))}
    </>
  );
}
