import { cookies } from "next/headers";
import { PageHeader } from "@/components/ext/page-header";
import { StorefrontPreview } from "./preview";

export const dynamic = "force-dynamic";

export default async function StorefrontPreviewPage({ params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  // The preview iframe shares the visitor cookie, so the toolbar starts on the country the storefront will use.
  const country = (await cookies()).get("cf_country")?.value || null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Storefront preview" description="Exactly what a visitor sees right now, rendered from the published snapshot." />
      <StorefrontPreview storeSlug={store} initialCountry={country} />
    </div>
  );
}
