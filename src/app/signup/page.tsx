import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/landing/site-footer";
import { LogoMark, SiteHeader } from "@/components/landing/site-chrome";
import { currentUser } from "@/lib/session";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage() {
  const user = await currentUser();
  if (user) redirect("/app");
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader signIn={false} />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-14 md:px-6 md:py-20">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(228,71,15,0.14), rgba(228,71,15,0.04) 55%, transparent 75%)" }} />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/10" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/7" />
        <div className="relative w-full max-w-[440px] rounded-[28px] bg-card p-7 shadow-[var(--shadow-pop)] ring-1 ring-border/70 sm:p-9">
          <LogoMark size={40} />
          <p className="mt-6 text-sm font-medium text-brand">New merchant</p>
          <h1 className="font-display mt-2 text-[34px] leading-none text-ink">Create your store</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">One account, one store of your own. Upload a supplier sheet and get a shop in English, German and French.</p>
          <SignupForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
