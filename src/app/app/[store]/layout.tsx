import { redirect } from "next/navigation";
import { Masthead } from "@/components/shell/masthead";
import { getConfig } from "@/lib/config";
import { optionalStore, userStores } from "@/lib/session";
import { getDb } from "@/db/client";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ store: string }> }) {
  const { store: slug } = await params;
  const ctx = await optionalStore(slug);
  if (!ctx) redirect("/login");
  const allStores = await userStores(ctx.user.id);
  const cfg = getConfig();
  const [row] = await getDb().select({ settings: stores.settings }).from(stores).where(eq(stores.id, ctx.store.id)).limit(1);
  const demoMode = !(row?.settings.encryptedApiKey || (cfg.AI_PROVIDER === "anthropic" && cfg.ANTHROPIC_API_KEY));
  return (
    <div className="flex min-h-dvh flex-col">
      <Masthead user={ctx.user} store={ctx.store} stores={allStores} demoMode={demoMode} />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-center text-[11px] text-ink-muted md:px-6">
        CatalogForge · prices and SKUs are never written by the model · every claim links to its source row
      </footer>
    </div>
  );
}
