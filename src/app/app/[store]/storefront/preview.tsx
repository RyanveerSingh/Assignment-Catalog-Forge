"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { cn } from "cn";
import { CountrySwitcher } from "@/components/storefront/country-switcher";
import { Button, buttonVariants } from "@/components/ui/button";

type Device = "desktop" | "mobile";

const DEVICES: ReadonlyArray<{ key: Device; label: string; Icon: typeof Monitor }> = [
  { key: "desktop", label: "Desktop", Icon: Monitor },
  { key: "mobile", label: "Mobile · 390 px", Icon: Smartphone },
];

export function StorefrontPreview({ storeSlug, initialCountry }: { storeSlug: string; initialCountry: string | null }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [frameKey, setFrameKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const src = `/store/${encodeURIComponent(storeSlug)}`;

  const reload = () => {
    setLoading(true);
    setFrameKey((k) => k + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-card px-3 py-2 hairline">
        <div className="flex flex-wrap items-center gap-4">
          <CountrySwitcher country={initialCountry} onChanged={reload} />
          <div role="group" aria-label="Device" className="inline-flex rounded-sm bg-muted p-0.5">
            {DEVICES.map(({ key, label, Icon }) => {
              const active = device === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDevice(key)}
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                    active ? "bg-card text-ink hairline" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reload} aria-busy={loading}>
            <RefreshCw aria-hidden className={cn(loading && "animate-spin")} />
            Reload
          </Button>
          <Link href={src} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}>
            Open in new tab
            <ExternalLink aria-hidden />
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-sm bg-paper-deep p-3 hairline md:p-5">
        <div
          className={cn("mx-auto overflow-hidden rounded-sm bg-paper ring-1 ring-ink/15 transition-[width] duration-200", device === "mobile" ? "w-[390px]" : "w-full")}
          style={{ height: device === "mobile" ? 760 : 720 }}
        >
          <iframe key={frameKey} title="Storefront preview" src={src} onLoad={() => setLoading(false)} className="h-full w-full border-0 bg-paper" />
        </div>
      </div>

      <p className="max-w-3xl text-xs text-ink-muted">
        The storefront reads only the published snapshot table through its own small connection pool, with results cached for 30 seconds. It never calls the AI and never
        sees drafts or products under review, so it stays fast and stable while an import is running.
      </p>
    </div>
  );
}
