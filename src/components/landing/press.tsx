"use client";

import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { PointerEvent, ReactNode } from "react";

const MotionLink = motion.create(Link);

/** How far the magnetic button follows the pointer, in px, and how much of the pointer's offset it takes. */
const PULL_MAX = 5;
const PULL_RATIO = 0.22;

interface Props {
  href: string;
  className?: string;
  children: ReactNode;
  /** Follow the pointer a few pixels while hovered; for the one or two buttons that matter most. */
  magnetic?: boolean;
}

/**
 * A link that presses (scale 0.98) and, when asked, leans towards the pointer. Transform only, springs
 * for the return, nothing under reduced motion.
 */
export function PressLink({ magnetic = false, children, ...props }: Props) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 22, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 300, damping: 22, mass: 0.4 });

  const follow = (e: PointerEvent<HTMLAnchorElement>): void => {
    if (!magnetic || reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * PULL_RATIO;
    const dy = (e.clientY - (r.top + r.height / 2)) * PULL_RATIO;
    x.set(Math.max(-PULL_MAX, Math.min(PULL_MAX, dx)));
    y.set(Math.max(-PULL_MAX, Math.min(PULL_MAX, dy)));
  };
  const release = (): void => {
    x.set(0);
    y.set(0);
  };

  return (
    <MotionLink
      {...props}
      style={{ x: sx, y: sy }}
      // Always defined: a `whileTap` adds tabindex to the anchor, and the markup must not depend on the motion preference.
      whileTap={{ scale: reduce ? 1 : 0.98 }}
      whileHover={magnetic ? undefined : { y: reduce ? 0 : -1 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      onPointerMove={follow}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      {children}
    </MotionLink>
  );
}
