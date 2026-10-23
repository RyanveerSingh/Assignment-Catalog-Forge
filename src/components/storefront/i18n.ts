/**
 * The handful of UI strings the storefront adds around the translated product data. Product
 * content arrives already localised; this only covers chrome (bag, sort, delivery lines, labels).
 * Unknown locales fall back to English. No library: three small objects keyed by locale, one per
 * file so each stays readable.
 */

import { DE } from "./i18n-de";
import { EN, type UiKey } from "./i18n-en";
import { FR } from "./i18n-fr";

export type { UiKey };
export type StorefrontLocale = "en" | "de" | "fr";

const DICT: Record<StorefrontLocale, Record<UiKey, string>> = { en: EN, de: DE, fr: FR };

/** Language names as their speakers write them; used in the ship-to line, the footer and the fallback notice. */
const NATIVE_NAMES: Record<string, string> = { en: "English", de: "Deutsch", fr: "Français", es: "Español", it: "Italiano", nl: "Nederlands" };

export function uiLocale(locale: string): StorefrontLocale {
  return locale === "de" || locale === "fr" ? locale : "en";
}

export function nativeLocaleName(locale: string): string {
  return NATIVE_NAMES[locale] ?? locale.toUpperCase();
}

export function t(locale: string, key: UiKey, vars?: Record<string, string | number>): string {
  const template = DICT[uiLocale(locale)][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

/** `plural(locale, "products", 3)` reads `productsMany`; `n === 1` reads `productsOne`. */
export function plural(locale: string, base: "items" | "products" | "categories" | "sizes" | "colours" | "variants", n: number): string {
  return t(locale, `${base}${n === 1 ? "One" : "Many"}` as UiKey, { n });
}

/** `set_contents` → "Set contents"; keys with a dictionary entry get the translated label instead. */
export function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

export function optionLabel(locale: string, name: string): string {
  const key = `option.${name.trim().toLowerCase()}`;
  return key in EN ? t(locale, key as UiKey) : humanizeKey(name);
}

export function attributeLabel(locale: string, key: string): string {
  const k = `attr.${key.trim().toLowerCase()}`;
  return k in EN ? t(locale, k as UiKey) : humanizeKey(key);
}

/** "a, b and c" in the visitor's language; falls back to commas where Intl.ListFormat is missing. */
export function formatList(locale: string, items: string[]): string {
  try {
    return new Intl.ListFormat(uiLocale(locale), { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}
