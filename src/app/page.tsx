import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { currentUser, userStores } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "CatalogForge — messy supplier sheets in, a shop-ready catalogue out" },
  description: "Upload a supplier spreadsheet with photos; get cleaned prices and SKUs, written and translated listings, and the source cell behind every claim.",
};

/** Signed-in merchants land in their first store; everyone else sees the landing page. */
export default async function Home() {
  const user = await currentUser();
  if (user) {
    const first = (await userStores(user.id))[0];
    if (!first) redirect("/login?error=no-store");
    redirect(`/app/${first.slug}/upload`);
  }
  return <LandingPage />;
}
