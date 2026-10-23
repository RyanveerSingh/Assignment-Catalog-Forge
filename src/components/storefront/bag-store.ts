"use client";

import { useSyncExternalStore } from "react";

/**
 * Demo bag kept in localStorage, one key per store. Every write dispatches a window event so the
 * header count and the drawer stay in sync without a provider; the `storage` event covers other tabs.
 */

export interface BagItem {
  /** `${handle}:${sku}`, the identity of a line. */
  key: string;
  handle: string;
  sku: string;
  title: string;
  /** Human option summary such as "Size 24 cm · Colour Grey"; empty when the product has one variant. */
  variant: string;
  priceCents: number | null;
  currency: string | null;
  imageId: string | null;
  qty: number;
}

const CHANGE_EVENT = "cf-bag:change";
const OPEN_EVENT = "cf-bag:open";
const MAX_QTY = 99;
const EMPTY: BagItem[] = [];

function storageKey(slug: string): string {
  return `cf-bag:${slug}`;
}

function isItem(value: unknown): value is BagItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.key === "string" && typeof v.handle === "string" && typeof v.sku === "string" && typeof v.title === "string" && typeof v.qty === "number" && Number.isFinite(v.qty) && v.qty > 0;
}

// Snapshot cache: useSyncExternalStore needs a stable reference while the stored string is unchanged.
let cachedRaw: string | null | undefined;
let cachedItems: BagItem[] = EMPTY;

function read(slug: string): BagItem[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(slug));
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  if (!raw) return (cachedItems = EMPTY);
  try {
    const parsed: unknown = JSON.parse(raw);
    cachedItems = Array.isArray(parsed) ? parsed.filter(isItem).map((i) => ({ ...i, qty: Math.min(MAX_QTY, Math.round(i.qty)) })) : EMPTY;
  } catch {
    cachedItems = EMPTY;
  }
  return cachedItems;
}

function write(slug: string, items: BagItem[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(storageKey(slug));
    else window.localStorage.setItem(storageKey(slug), JSON.stringify(items));
  } catch {
    // Private mode or a full quota: the in-memory snapshot below still updates this tab.
    cachedRaw = items.length ? JSON.stringify(items) : null;
    cachedItems = items;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function addToBag(slug: string, item: Omit<BagItem, "key" | "qty">, qty: number): void {
  const key = `${item.handle}:${item.sku}`;
  const items = read(slug);
  const existing = items.find((i) => i.key === key);
  const next = existing ? items.map((i) => (i.key === key ? { ...i, qty: Math.min(MAX_QTY, i.qty + qty) } : i)) : [...items, { ...item, key, qty: Math.min(MAX_QTY, qty) }];
  write(slug, next);
}

export function setBagQty(slug: string, key: string, qty: number): void {
  const items = read(slug);
  const next = qty <= 0 ? items.filter((i) => i.key !== key) : items.map((i) => (i.key === key ? { ...i, qty: Math.min(MAX_QTY, qty) } : i));
  write(slug, next);
}

export function removeFromBag(slug: string, key: string): void {
  setBagQty(slug, key, 0);
}

export function openBag(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onBagOpen(listener: () => void): () => void {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** Server snapshot is empty, so the count renders as 0 and fills in after hydration without a mismatch. */
export function useBag(slug: string): BagItem[] {
  return useSyncExternalStore(subscribe, () => read(slug), () => EMPTY);
}

export function bagCount(items: BagItem[]): number {
  return items.reduce((n, i) => n + i.qty, 0);
}

/** Only when every line is priced in one currency; a cross-currency sum would be a lie. */
export function bagSubtotal(items: BagItem[]): { cents: number; currency: string } | null {
  if (items.length === 0) return null;
  const currency = items[0]?.currency;
  if (!currency) return null;
  let cents = 0;
  for (const i of items) {
    if (i.priceCents === null || i.currency !== currency) return null;
    cents += i.priceCents * i.qty;
  }
  return { cents, currency };
}
