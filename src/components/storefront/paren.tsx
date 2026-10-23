import { cn } from "cn";

/**
 * The storefront's text button: a label between parentheses, "( Shop all )". The parentheses are
 * decoration, so they are hidden from assistive tech, and on hover they move a few pixels apart
 * (transform only) when the enclosing link or button carries `group/paren`.
 */
export function Paren({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline whitespace-nowrap", className)}>
      <span aria-hidden className="mr-[0.3em] inline-block transition-transform duration-300 ease-out group-hover/paren:-translate-x-[3px] group-focus-visible/paren:-translate-x-[3px]">
        (
      </span>
      <span>{children}</span>
      <span aria-hidden className="ml-[0.3em] inline-block transition-transform duration-300 ease-out group-hover/paren:translate-x-[3px] group-focus-visible/paren:translate-x-[3px]">
        )
      </span>
    </span>
  );
}

/** Classes shared by every parenthesised link and button: 44 px tall, visible focus, the hover handled by `Paren`. */
export const PAREN_LINK = "group/paren inline-flex min-h-11 cursor-pointer items-center rounded-full text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-current";

/** An ink pill for the one action that should read as a button, "( Add to bag )". */
export const PILL = "group/paren inline-flex h-12 cursor-pointer items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-white outline-none transition-[background-color,scale] duration-200 hover:bg-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
