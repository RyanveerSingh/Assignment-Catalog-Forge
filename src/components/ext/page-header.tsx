import { cn } from "cn";

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">{eyebrow}</div> : null}
        <h1 className="font-display text-3xl leading-tight text-ink md:text-4xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 border border-dashed border-border bg-card/60 px-6 py-14 text-center", className)}>
      <div className="font-display text-xl text-ink">{title}</div>
      {description ? <p className="max-w-md text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
