import { LandingBeforeAfter } from "./landing-before-after";
import { LandingCta } from "./landing-cta";
import { LandingHero } from "./landing-hero";
import { LandingNumbers } from "./landing-numbers";
import { LandingPromises } from "./landing-promises";
import { LandingSteps } from "./landing-steps";
import { LandingTryIt } from "./landing-try-it";
import { ScrollPathAnimator } from "./scroll-path";
import { SiteFooter, SiteHeader } from "./site-chrome";

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
        <ScrollPathAnimator>
          <LandingSteps />
          <LandingBeforeAfter />
          <LandingTryIt />
          <LandingNumbers />
          <LandingPromises />
          <LandingCta dashboardHref={dashboardHref} />
        </ScrollPathAnimator>
      </main>
      <SiteFooter />
    </div>
  );
}
