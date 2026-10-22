import { PageHeader } from "@/components/ext/page-header";
import { MetricsDashboard } from "@/components/metrics/metrics-dashboard";

export const dynamic = "force-dynamic";

export default async function MetricsPage({ params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Metrics" title="Cost, speed and quality" description="What the AI stage costs, how fast imports run and how much of the catalog is translated. Computed live from the tables of record." />
      <MetricsDashboard storeSlug={store} />
    </div>
  );
}
