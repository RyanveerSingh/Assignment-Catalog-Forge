/**
 * Turns raw taxonomy paths ("Home & Garden > Decor > Clocks") into something a shopper can scan:
 * short leaf labels grouped under their top-level family. Pure; the paths come from
 * `cachedCategories` and stay the link targets, only the labels change.
 */

export interface CategoryCount {
  category: string;
  n: number;
}

export interface CategoryLeaf {
  /** Full path, used for links and for matching the current page. */
  category: string;
  label: string;
  n: number;
}

export interface CategoryFamily {
  family: string;
  label: string;
  n: number;
  leaves: CategoryLeaf[];
}

export function segments(path: string): string[] {
  return path
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Capitalises the first letter of each word and leaves the rest alone, so "Pots & Pans" and "iPad" survive. */
export function titleCase(label: string): string {
  return label.replace(/(^|\s)(\p{Ll})/gu, (_, space: string, ch: string) => space + ch.toUpperCase());
}

export function leafLabel(path: string): string {
  const parts = segments(path);
  return titleCase(parts[parts.length - 1] ?? path);
}

export function familyOf(path: string): string {
  return segments(path)[0] ?? path;
}

/** The segments above the leaf, for an eyebrow line such as "Home & Garden › Decor". */
export function parentSegments(path: string): string[] {
  return segments(path).slice(0, -1).map(titleCase);
}

/**
 * Groups by first segment and deduplicates leaves by label inside a family: the shortest path
 * wins because the category filter is a prefix match, so it already includes the deeper ones.
 * Families are ordered by product count, leaves alphabetically for scanning.
 */
export function groupCategories(list: CategoryCount[]): CategoryFamily[] {
  const families = new Map<string, { label: string; n: number; leaves: Map<string, CategoryLeaf> }>();
  for (const { category, n } of list) {
    const family = familyOf(category);
    const entry = families.get(family) ?? { label: titleCase(family), n: 0, leaves: new Map() };
    entry.n += n;
    const label = leafLabel(category);
    const existing = entry.leaves.get(label);
    if (!existing) entry.leaves.set(label, { category, label, n });
    else entry.leaves.set(label, { category: category.length < existing.category.length ? category : existing.category, label, n: existing.n + n });
    families.set(family, entry);
  }
  return [...families.entries()]
    .map(([family, e]) => ({
      family,
      label: e.label,
      n: e.n,
      leaves: [...e.leaves.values()].sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

/** Every leaf across families, deduplicated by label (highest count wins), most popular first. */
export function flatLeaves(families: CategoryFamily[]): CategoryLeaf[] {
  const byLabel = new Map<string, CategoryLeaf>();
  for (const f of families)
    for (const leaf of f.leaves) {
      const existing = byLabel.get(leaf.label);
      if (!existing || leaf.n > existing.n) byLabel.set(leaf.label, leaf);
    }
  return [...byLabel.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

/**
 * Chips for a category page: the leaves below the path when it is a family or a middle level
 * ("Decor" → Clocks, Rugs, Vases), otherwise the other leaves of the same family.
 */
export function relatedLeaves(families: CategoryFamily[], path: string): CategoryLeaf[] {
  const family = families.find((f) => f.family === familyOf(path));
  if (!family) return [];
  const children = family.leaves.filter((l) => l.category.startsWith(`${path} > `));
  if (children.length > 0) return children;
  return family.leaves.filter((l) => l.category !== path);
}
