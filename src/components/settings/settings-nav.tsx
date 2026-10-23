"use client";

import { useEffect, useState } from "react";
import { BookAIcon, FlaskConicalIcon, LanguagesIcon, type LucideIcon, SparklesIcon, StoreIcon, WebhookIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { spring } from "@/components/ext/motion";

export const SETTINGS_SECTIONS: ReadonlyArray<{ id: string; label: string; icon: LucideIcon }> = [
  { id: "store", label: "Store", icon: StoreIcon },
  { id: "languages", label: "Languages", icon: LanguagesIcon },
  { id: "translation", label: "Translation", icon: BookAIcon },
  { id: "ai", label: "AI", icon: SparklesIcon },
  { id: "webhooks", label: "Webhooks", icon: WebhookIcon },
  { id: "chaos", label: "Chaos", icon: FlaskConicalIcon },
];

/**
 * The section list beside the settings cards: sticky on desktop, a scrolling pill row on phones.
 * The highlighted entry follows the section nearest the top of the viewport as the page scrolls.
 */
export function SettingsNav() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(SETTINGS_SECTIONS[0]?.id ?? "store");

  useEffect(() => {
    const sections = SETTINGS_SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        // The section whose top is closest to the top edge wins; ties go to document order.
        const first = SETTINGS_SECTIONS.find((s) => visible.has(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: [0, 0.1] },
    );
    for (const el of sections) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-20">
      <ul className="flex gap-1 overflow-x-auto pb-1 no-scrollbar max-lg:-mx-4 max-lg:px-4 lg:flex-col">
        {SETTINGS_SECTIONS.map((s) => {
          const on = s.id === active;
          const Icon = s.icon;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={on ? "location" : undefined}
                onClick={() => setActive(s.id)}
                className={cn("relative flex h-10 cursor-pointer items-center gap-2.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand lg:rounded-xl", on ? "text-brand" : "text-ink-muted hover:text-ink")}
              >
                {on ? (
                  reduce ? (
                    <span aria-hidden className="absolute inset-0 rounded-full bg-brand-soft lg:rounded-xl" />
                  ) : (
                    <motion.span aria-hidden layoutId="settings-nav-pill" transition={spring(reduce)} className="absolute inset-0 rounded-full bg-brand-soft lg:rounded-xl" />
                  )
                ) : null}
                <Icon className="relative size-4" aria-hidden />
                <span className="relative">{s.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
