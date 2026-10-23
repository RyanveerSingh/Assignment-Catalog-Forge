import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
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
    <AppShell user={ctx.user} store={ctx.store} stores={allStores} demoMode={demoMode}>
      {children}
    </AppShell>
  );
}
