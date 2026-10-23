import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { currentUser, userStores } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "CatalogForge — messy supplier sheets in, a shop-ready catalogue out" },
  description: "Upload a supplier spreadsheet with photos; get cleaned prices and SKUs, written and translated listings, and the source cell behind every claim.",
};

/** Everyone sees the landing page; a signed-in merchant gets a way into their first store from it. */
export default async function Home() {
  const user = await currentUser();
  let dashboardHref: string | null = null;
  if (user) {
    const first = (await userStores(user.id))[0];
    if (!first) redirect("/login?error=no-store");
    dashboardHref = `/app/${first.slug}/upload`;
  }
  return <LandingPage dashboardHref={dashboardHref} />;
}
