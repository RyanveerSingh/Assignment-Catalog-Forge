"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { cn } from "cn";

const RADIUS = "90px";

/* A copy of the text in the second colour, shown only inside a soft circle around the pointer. */
const MASK = "radial-gradient(circle var(--spot-r) at var(--spot-x) var(--spot-y), #000 0 55%, transparent 100%)";
const OVERLAY_STYLE: CSSProperties = { maskImage: MASK, WebkitMaskImage: MASK };

function move(e: PointerEvent<HTMLElement>): void {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  // Custom properties, not React state: the circle follows the pointer without re-rendering anything.
  el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
  el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
}

function grow(e: PointerEvent<HTMLElement>): void {
  if (e.pointerType !== "mouse") return;
  move(e);
  e.currentTarget.style.setProperty("--spot-r", RADIUS);
}

function shrink(e: PointerEvent<HTMLElement>): void {
  e.currentTarget.style.setProperty("--spot-r", "0px");
}

interface Props {
  /** The text as it normally reads. */
  children: ReactNode;
  /** The same text laid out identically, in the colour the spotlight reveals. Defaults to `children` in orange. */
  lit?: ReactNode;
  className?: string;
}

/**
 * Text with a colour spotlight: a circle around the mouse recolours exactly the part of the letters it
 * covers. The lit copy sits on top, inherits the heading's font and width so it wraps identically, and
 * is masked to the circle; the radius eases in and out on enter and leave.
 */
export function SpotlightText({ children, lit, className }: Props) {
  return (
    <span className={cn("spotlight relative block", className)} onPointerEnter={grow} onPointerMove={move} onPointerLeave={shrink}>
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-0 select-none" style={OVERLAY_STYLE}>
        {lit ?? <span className="text-brand">{children}</span>}
      </span>
    </span>
  );
}
