import { cn } from "cn";
import { splitAccents } from "./accents";

/**
 * Renders a dictionary string with its `*accent*` runs in the italic serif. The serif has a lower
 * x-height than the grotesk, so the accent is nudged up a size to sit on the same visual line.
 */
export function AccentText({ text, accentClassName }: { text: string; accentClassName?: string }) {
  return (
    <>
      {splitAccents(text).map((run, i) =>
        run.accent ? (
          <em key={i} className={cn("font-serif-italic text-[1.08em] font-normal not-italic", accentClassName)}>
            {run.text}
          </em>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}
