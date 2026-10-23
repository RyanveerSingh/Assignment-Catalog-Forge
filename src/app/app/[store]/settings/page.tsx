import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ext/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { optionalStore } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  const ctx = await optionalStore(store);
  if (!ctx) redirect("/login");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Store settings" description="Languages, translation rules, the AI key and the import budget. Changes apply from the next import." />
      <SettingsForm storeSlug={store} isOwner={ctx.store.role === "owner"} />
    </div>
  );
}
