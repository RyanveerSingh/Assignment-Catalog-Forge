import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; demo?: string }> }) {
  const user = await currentUser();
  if (user) redirect("/app");
  const { error, demo } = await searchParams;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader signIn={false} />
      <main className="flex flex-1 items-center justify-center px-4 py-10 md:px-6">
        <div className="w-full max-w-sm">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">Merchant sign-in</p>
          <h1 className="font-display text-4xl text-ink">Sign in</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            The demo is one shared merchant account with stores already set up for English, German and French and sample sheets to drop in; anything you upload there is visible to other visitors.
          </p>
          {error === "no-store" ? <p className="mt-3 border-l-[3px] border-warning bg-warning-soft px-3 py-2 text-sm text-ink">Your account has no store yet.</p> : null}
          <LoginForm prefillDemo={demo === "1"} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
