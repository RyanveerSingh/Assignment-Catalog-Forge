import { loadDemoShop } from "./demo-shop";
import { LandingFacts } from "./landing-facts";
import { LandingHero } from "./landing-hero";
import { LandingNumbers } from "./landing-numbers";
import { LandingShopStrip } from "./landing-shop-strip";
import { SiteHeader } from "./site-chrome";
import { SiteFooter } from "./site-footer";

interface Props {
  /** Where a signed-in merchant's dashboard is; null for a visitor. */
  dashboardHref: string | null;
}

/** What a visitor sees at `/`: the product working, the shop it built, why it stays right, and the measured numbers. */
export async function LandingPage({ dashboardHref }: Props) {
  const shop = await loadDemoShop();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader dashboardHref={dashboardHref} />
      <main className="flex-1 overflow-x-clip">
        <LandingHero tiles={shop.tiles} />
        <LandingShopStrip shop={shop} />
        <LandingFacts />
        <LandingNumbers />
      </main>
      <SiteFooter dashboardHref={dashboardHref} />
    </div>
  );
}
