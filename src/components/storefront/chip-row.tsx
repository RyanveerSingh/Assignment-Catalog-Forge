"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";

type Edge = "none" | "left" | "right" | "both";

/* The mask is a transparency ramp into the page, not a colour gradient: it reads as "there is more". */
const MASK =
  "data-[edge=right]:[mask-image:linear-gradient(to_right,#000_calc(100%-4rem),transparent)] data-[edge=left]:[mask-image:linear-gradient(to_right,transparent,#000_4rem)] data-[edge=both]:[mask-image:linear-gradient(to_right,transparent,#000_4rem,#000_calc(100%-4rem),transparent)]";

/**
 * A horizontal chip strip whose overflowing end fades out, so a phone user can tell the row scrolls.
 * The fade follows the scroll position and disappears at the end; it starts on the right, the usual
 * case for a strip with more chips than fit, and corrects itself after mount when there is nothing to scroll.
 */
export function ChipRow({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState<Edge>("right");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setEdge(left && right ? "both" : right ? "right" : left ? "left" : "none");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <ul ref={ref} data-edge={edge} className={cn(className, MASK)}>
      {children}
    </ul>
  );
}
