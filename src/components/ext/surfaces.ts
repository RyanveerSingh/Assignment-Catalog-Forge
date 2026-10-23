/**
 * Class recipes for the surfaces of the second design system, shared so every card, lift and ring
 * reads the same. Kept as strings (not components) so they compose with any element.
 */

/** A raised white card: the unit of the dashboard. */
export const CARD = "card-raised rounded-2xl";

/** Column heading inside a table card. */
export const TH = "text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted";

/** A pill button that toggles: pressed = blue-soft, otherwise white with a hairline. 36 px tall for a comfortable tap. */
export const PILL_TOGGLE =
  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap ring-1 ring-inset transition-[transform,background-color,color] duration-150 active:scale-[0.97]";
export const PILL_ON = "bg-brand-soft text-brand ring-brand/30";
export const PILL_OFF = "bg-card text-ink-muted ring-border hover:bg-surface-2 hover:text-ink";
