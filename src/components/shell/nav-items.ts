import { BarChart3Icon, type LucideIcon, PackageIcon, SettingsIcon, StoreIcon, UploadCloudIcon } from "lucide-react";

interface NavItem {
  key: "upload" | "products" | "storefront" | "metrics" | "settings";
  label: string;
  /** The section word the top bar prints above the page title. */
  eyebrow: string;
  icon: LucideIcon;
}

/** The five sections, in sidebar and bottom-bar order. */
export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: "upload", label: "Upload", eyebrow: "Imports", icon: UploadCloudIcon },
  { key: "products", label: "Products", eyebrow: "Catalog", icon: PackageIcon },
  { key: "storefront", label: "Storefront", eyebrow: "Shop", icon: StoreIcon },
  { key: "metrics", label: "Metrics", eyebrow: "Insights", icon: BarChart3Icon },
  { key: "settings", label: "Settings", eyebrow: "Store", icon: SettingsIcon },
];

export function navHref(storeSlug: string, key: NavItem["key"]): string {
  return `/app/${storeSlug}/${key}`;
}

/** The section a pathname belongs to, and the title the top bar shows for it. */
export function pageMeta(pathname: string, storeSlug: string): { item: NavItem | null; title: string } {
  const item = NAV_ITEMS.find((n) => {
    const href = navHref(storeSlug, n.key);
    return pathname === href || pathname.startsWith(`${href}/`);
  });
  if (!item) return { item: null, title: "" };
  const deeper = pathname !== navHref(storeSlug, item.key);
  if (item.key === "upload" && deeper) return { item, title: "Import" };
  if (item.key === "storefront") return { item, title: "Preview" };
  return { item, title: item.label };
}
