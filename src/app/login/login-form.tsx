"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/client/api";

const DEMO = { email: "demo@catalogforge.dev", password: "demo1234" } as const;

/** `prefillDemo` (from `/login?demo=1`) fills the demo credentials; the demo button fills them and signs in at once. */
export function LoginForm({ prefillDemo = false }: { prefillDemo?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(prefillDemo ? DEMO.email : "");
  const [password, setPassword] = useState(prefillDemo ? DEMO.password : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);

  const signIn = async (creds: { email: string; password: string }, source: "form" | "demo"): Promise<void> => {
    setBusy(source);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: creds });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
      setBusy(null);
    }
  };

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void signIn({ email, password }, "form");
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-card" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-card" />
      </div>
      {error ? (
        <p role="alert" className="border-l-[3px] border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full cursor-pointer" disabled={busy !== null}>
        {busy === "form" ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-ink-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full cursor-pointer"
        disabled={busy !== null}
        onClick={() => {
          setEmail(DEMO.email);
          setPassword(DEMO.password);
          void signIn(DEMO, "demo");
        }}
      >
        {busy === "demo" ? "Opening the demo…" : "Use the demo account"}
      </Button>
      <p className="text-center text-xs text-ink-muted">
        <span className="num">{DEMO.email}</span> · <span className="num">{DEMO.password}</span>
      </p>
    </form>
  );
}
