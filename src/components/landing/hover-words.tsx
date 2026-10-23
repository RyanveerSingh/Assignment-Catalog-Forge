import { cn } from "cn";

/* Shared with the hero headline, whose words are already separate spans. */
export const HOVER_WORD = "transition-colors duration-300 ease-out hover:text-brand";

/**
 * A heading whose words each turn orange under the pointer and fade back when it leaves. Pure CSS
 * (a colour transition per word), so it costs nothing while scrolling and needs no client code.
 */
export function HoverWords({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <span key={`${i}-${w}`} className={cn(HOVER_WORD, className)}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}
