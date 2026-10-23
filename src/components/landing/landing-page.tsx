import { LandingHero } from "./landing-hero";
import { LandingPromises } from "./landing-promises";
import { LandingSteps } from "./landing-steps";
import { SiteFooter, SiteHeader } from "./site-chrome";

/** What a signed-out visitor sees at `/`. Every sentence here is true of the product; there is no copy beyond that. */
export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <LandingHero />
        <LandingSteps />
        <LandingPromises />
      </main>
      <SiteFooter />
    </div>
  );
}
