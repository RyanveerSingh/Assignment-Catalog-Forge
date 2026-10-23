"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";

const DEBOUNCE_MS = 300;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * The search field in the top bar. "/" focuses it from anywhere. On the products page it filters the
 * table as you type (the filters live in `?q=`, which the table already watches); elsewhere Enter
 * jumps to the products page with the query.
 */
export function GlobalSearch({ storeSlug, className }: { storeSlug: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const productsPath = `/app/${storeSlug}/products`;
  const onProducts = pathname === productsPath;
  const urlQ = onProducts ? (searchParams.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQ);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPushed = useRef(urlQ);

  // Adopt the URL's query when something else changed it (back button, a cleared filter), never our own push.
  useEffect(() => {
    if (urlQ === lastPushed.current) return;
    lastPushed.current = urlQ;
    setValue(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (!onProducts || value === urlQ) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) sp.set("q", value);
      else sp.delete("q");
      sp.delete("offset");
      lastPushed.current = value;
      const qs = sp.toString();
      router.replace(qs ? `${productsPath}?${qs}` : productsPath, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, urlQ, onProducts, productsPath, router, searchParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const q = value.trim();
    if (onProducts) return;
    router.push(q ? `${productsPath}?q=${encodeURIComponent(q)}` : productsPath);
  };

  return (
    <div className={cn("group relative", className)}>
      <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted transition-colors group-focus-within:text-brand" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setValue("");
            inputRef.current?.blur();
          }
        }}
        placeholder={onProducts ? "Filter products…" : "Search products…"}
        aria-label="Search products by title, handle, key or SKU"
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-full rounded-full bg-card pr-12 pl-10 text-[13px] text-ink ring-1 ring-border transition-[box-shadow] outline-none placeholder:text-ink-muted/80 focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => setValue("")} className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink">
          <XIcon className="size-3.5" aria-hidden />
        </button>
      ) : (
        <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-3 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-md bg-surface-2 px-1.5 font-sans text-[11px] text-ink-muted ring-1 ring-border">
          /
        </kbd>
      )}
    </div>
  );
}
