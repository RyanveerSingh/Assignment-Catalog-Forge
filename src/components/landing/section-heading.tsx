import { cn } from "cn";
import { SpotlightText } from "./spotlight-text";
import { Reveal } from "./reveal";

interface Props {
  id: string;
  eyebrow: string;
  title: string;
  text?: string;
  align?: "center" | "left";
  className?: string;
}

/** The heading block every section opens with: a small eyebrow, a Lexend title and at most one sentence. */
export function SectionHeading({ id, eyebrow, title, text, align = "center", className }: Props) {
  const centred = align === "center";
  return (
    <Reveal className={cn("flex flex-col", centred ? "items-center text-center" : "items-start text-left", className)}>
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h2 id={id} className={cn("font-display mt-3 text-balance text-[34px] leading-[1.05] text-ink sm:text-[40px] md:text-[48px]", centred ? "max-w-[22ch]" : "max-w-[20ch]")}>
        <SpotlightText>{title}</SpotlightText>
      </h2>
      {text ? <p className={cn("mt-4 text-balance text-base leading-relaxed text-ink-muted md:text-lg", centred ? "max-w-2xl" : "max-w-xl")}>{text}</p> : null}
    </Reveal>
  );
}
