import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (user) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between bg-ink p-10 text-paper lg:flex">
        <div className="font-display text-3xl tracking-tight">
          Catalog<span className="text-brand">Forge</span>
        </div>
        <div className="max-w-lg">
          <p className="font-display text-5xl leading-[1.05]">
            Drop in a supplier sheet.
            <br />
            Get a store-ready catalog
            <br />
            in three languages.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-paper/70">
            <li>· Prices, SKUs and units are cleaned by code, never by a model.</li>
            <li>· Every claim in a listing points at the cell it came from.</li>
            <li>· Imports survive restarts, rate limits and re-uploads without duplicates.</li>
          </ul>
        </div>
        <div className="text-xs text-paper/50">Built for the CatalogForge assignment · Ryanveer Singh</div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="font-display text-3xl tracking-tight text-ink">
              Catalog<span className="text-brand">Forge</span>
            </div>
          </div>
          <h1 className="font-display text-3xl text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">Demo account: demo@catalogforge.dev / demo1234</p>
          {error === "no-store" ? <p className="mt-3 rounded-sm bg-warning-soft px-3 py-2 text-sm text-warning">Your account has no store yet.</p> : null}
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
