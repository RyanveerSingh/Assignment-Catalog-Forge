/** The title block at the top of a page: the eyebrow lives in the top bar, so this is the Lexend title and one line of description. */
export function PageHeader({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-[1.1] text-ink md:text-[2rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
    </div>
  );
}

/** A quiet empty state inside a dashed rounded frame; `art` takes an illustration above the words. */
export function EmptyState({ title, description, action, art }: { title: string; description?: string; action?: React.ReactNode; art?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-card/70 px-6 py-14 text-center">
      {art ? <div className="mb-3">{art}</div> : null}
      <div className="font-display text-xl text-ink">{title}</div>
      {description ? <p className="max-w-md text-sm leading-relaxed text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
