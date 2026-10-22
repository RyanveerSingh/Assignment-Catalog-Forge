/** Rendered inside the storefront chrome for unknown stores, unpublished products and bad handles (EC-H1, H5). */
export default function StorefrontNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">404</p>
      <h1 className="font-display text-4xl text-ink">This page is not available</h1>
      <p className="max-w-md text-sm text-ink-muted">The product may have been removed or is not published yet. Use the categories above to keep browsing.</p>
    </div>
  );
}
