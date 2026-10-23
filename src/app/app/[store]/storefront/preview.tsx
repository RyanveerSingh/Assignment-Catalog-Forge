"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import { Segmented } from "@/components/ext/segmented";
import { CARD } from "@/components/ext/surfaces";
import { CountrySwitcher } from "@/components/storefront/country-switcher";
import { Button, buttonVariants } from "@/components/ui/button";

type Device = "desktop" | "mobile";

const DEVICES = [
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "mobile", label: "Phone · 390", icon: Smartphone },
] as const;

/**
 * The published shop inside a device frame: a browser window for desktop, a phone for mobile. One
 * iframe at a time (it is a full page); the frame cross-fades when the device changes.
 */
export function StorefrontPreview({ storeSlug, initialCountry }: { storeSlug: string; initialCountry: string | null }) {
  const reduce = useReducedMotion();
  const [device, setDevice] = useState<Device>("desktop");
  const [frameKey, setFrameKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const src = `/store/${encodeURIComponent(storeSlug)}`;
  // The address bar shows the real host; read after mount so the server and first client render agree.
  const [host, setHost] = useState("");
  useEffect(() => setHost(window.location.host), []);

  const reload = () => {
    setLoading(true);
    setFrameKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 md:px-4")}>
        <div className="flex flex-wrap items-center gap-4">
          <CountrySwitcher country={initialCountry} onChanged={reload} />
          <Segmented label="Device" value={device} options={DEVICES} onChange={setDevice} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={reload} aria-busy={loading} className="h-10 cursor-pointer rounded-full">
            <RefreshCw aria-hidden className={cn(loading && "animate-spin")} />
            Reload
          </Button>
          <Link href={src} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "h-10 cursor-pointer rounded-full")}>
            Open in new tab
            <ExternalLink aria-hidden />
          </Link>
        </div>
      </div>

      <div className="relative flex justify-center overflow-hidden rounded-3xl bg-surface-2/70 p-4 ring-1 ring-border md:p-8">
        <span aria-hidden className="glow-center pointer-events-none absolute inset-0" />
        <motion.div key={device} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={settle(reduce, 0.4)} className={cn("relative w-full", device === "mobile" && "max-w-[390px]")}>
          {device === "desktop" ? (
            <div className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-pop)] ring-1 ring-black/5">
              <div className="flex h-11 items-center gap-3 border-b border-border bg-paper px-4">
                <span aria-hidden className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#febc2e]" />
                  <span className="size-2.5 rounded-full bg-[#28c840]" />
                </span>
                <span className="num mx-auto flex h-7 w-full max-w-md items-center justify-center truncate rounded-full bg-card px-3 text-[11px] text-ink-muted ring-1 ring-border">
                  {host}
                  {src}
                </span>
              </div>
              <iframe key={frameKey} title="Storefront preview" src={src} onLoad={() => setLoading(false)} className="block h-[720px] w-full border-0 bg-paper" />
            </div>
          ) : (
            <div className="mx-auto w-[390px] max-w-full overflow-hidden rounded-[2.75rem] bg-ink p-2.5 shadow-[var(--shadow-pop)]">
              <div className="relative overflow-hidden rounded-[2.1rem] bg-paper">
                <span aria-hidden className="absolute top-2 left-1/2 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-ink" />
                <iframe key={frameKey} title="Storefront preview" src={src} onLoad={() => setLoading(false)} className="block h-[760px] w-full border-0 bg-paper" />
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <p className="max-w-3xl px-1 text-xs leading-relaxed text-ink-muted">
        The storefront reads only the published snapshot table through its own small connection pool, with results cached for 30 seconds. It never calls the AI and never sees drafts or products under review, so it stays fast and stable while an import is running.
      </p>
    </div>
  );
}
