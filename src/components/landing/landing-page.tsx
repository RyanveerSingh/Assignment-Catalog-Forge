import { LandingBeforeAfter } from "./landing-before-after";
import { LandingCta, LandingExplore } from "./landing-cta";
import { LandingFeatures } from "./landing-features";
import { LandingHero } from "./landing-hero";
import { LandingNumbers } from "./landing-numbers";
import { LandingPromises } from "./landing-promises";
import { LandingShopStrip } from "./landing-shop-strip";
import { LandingSteps } from "./landing-steps";
import { LandingTryIt } from "./landing-try-it";
import { LandingWorksWith } from "./landing-works-with";
import { SiteHeader } from "./site-chrome";
import { SiteFooter } from "./site-footer";

interface Props {
  /** Where a signed-in merchant's dashboard is; null for a visitor. */
  dashboardHref: string | null;
}

/** What a visitor sees at `/`. Every sentence here is true of the product; there is no copy beyond that. */
export function LandingPage({ dashboardHref }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader dashboardHref={dashboardHref} />
      <main className="flex-1 overflow-x-clip">
        <LandingHero dashboardHref={dashboardHref} />
        <LandingFeatures />
        <LandingSteps />
        <LandingBeforeAfter />
        <LandingTryIt />
        <LandingNumbers />
        <LandingWorksWith />
        <LandingPromises />
        <LandingShopStrip />
        <LandingCta dashboardHref={dashboardHref} />
        <LandingExplore dashboardHref={dashboardHref} />
      </main>
      <SiteFooter dashboardHref={dashboardHref} />
    </div>
  );
}
