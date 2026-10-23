import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/landing/site-footer";
import { LogoMark, SiteHeader } from "@/components/landing/site-chrome";
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
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-14 md:px-6 md:py-20">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(228,71,15,0.14), rgba(228,71,15,0.04) 55%, transparent 75%)" }} />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/10" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/7" />
        <div className="relative w-full max-w-[440px] rounded-[28px] bg-card p-7 shadow-[var(--shadow-pop)] ring-1 ring-border/70 sm:p-9">
          <LogoMark size={40} />
          <p className="mt-6 text-sm font-medium text-brand">Merchant sign-in</p>
          <h1 className="font-display mt-2 text-[34px] leading-none text-ink">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            The demo is one shared merchant account with stores already set up for English, German and French and sample sheets to drop in; anything you upload there is visible to other visitors.
          </p>
          {error === "no-store" ? <p className="mt-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-ink ring-1 ring-warning/30">Your account has no store yet.</p> : null}
          <LoginForm prefillDemo={demo === "1"} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
