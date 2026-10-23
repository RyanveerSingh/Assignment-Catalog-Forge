import { cn } from "cn";

/** The title block at the top of a page: the eyebrow lives in the top bar, so this is the Lexend title, one line of description and the actions. */
export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">{eyebrow}</div> : null}
        <h1 className="font-display text-[1.75rem] leading-[1.1] text-ink md:text-[2rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A quiet empty state inside a dashed rounded frame; `art` takes an illustration above the words. */
export function EmptyState({ title, description, action, art, className }: { title: string; description?: string; action?: React.ReactNode; art?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-card/70 px-6 py-14 text-center", className)}>
      {art ? <div className="mb-3">{art}</div> : null}
      <div className="font-display text-xl text-ink">{title}</div>
      {description ? <p className="max-w-md text-sm leading-relaxed text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
