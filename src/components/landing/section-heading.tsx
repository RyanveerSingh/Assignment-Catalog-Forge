import { SpotlightText } from "./spotlight-text";
import { Reveal } from "./reveal";

interface Props {
  id: string;
  eyebrow: string;
  title: string;
  text?: string;
}

/** The heading block every section opens with: a small eyebrow, a Lexend title and at most one sentence. */
export function SectionHeading({ id, eyebrow, title, text }: Props) {
  return (
    <Reveal className="flex flex-col items-center text-center">
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h2 id={id} className="font-display mt-3 max-w-[22ch] text-balance text-[34px] leading-[1.05] text-ink sm:text-[40px] md:text-[48px]">
        <SpotlightText>{title}</SpotlightText>
      </h2>
      {text ? <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-ink-muted md:text-lg">{text}</p> : null}
    </Reveal>
  );
}
