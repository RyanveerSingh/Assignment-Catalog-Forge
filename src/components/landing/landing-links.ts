/** Where a visitor is sent for anything that needs an account. */
export const DEMO_HREF = "/login?demo=1";
export const SHOP_HREF = "/store/demo";

export interface AppLinks {
  upload: string;
  products: string;
  metrics: string;
  /** Webhooks and API keys live on the settings page. */
  api: string;
  shop: string;
}

/**
 * The pages a landing link can open. `dashboardHref` is a signed-in merchant's upload page
 * (`/app/<slug>/upload`); the other pages of the same store sit beside it, so they are derived from it
 * rather than threaded through every component. A visitor is sent to the demo sign-in instead.
 */
export function appLinks(dashboardHref: string | null): AppLinks {
  const base = dashboardHref?.replace(/\/upload\/?$/, "") ?? null;
  const inApp = (page: string): string => (base ? `${base}/${page}` : DEMO_HREF);
  return {
    upload: dashboardHref ?? DEMO_HREF,
    products: inApp("products"),
    metrics: inApp("metrics"),
    api: base ? `${base}/settings#webhooks` : DEMO_HREF,
    shop: SHOP_HREF,
  };
}
