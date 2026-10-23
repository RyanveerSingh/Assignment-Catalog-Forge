"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { settle } from "@/components/ext/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/client/api";

const DEMO = { email: "demo@catalogforge.dev", password: "demo1234" } as const;
const ITEM: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };
const FIELD = "h-11 rounded-xl border-input bg-paper px-3.5 text-[15px] focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/25";

/** `prefillDemo` (from `/login?demo=1`) fills the demo credentials; the demo button fills them and signs in at once. */
export function LoginForm({ prefillDemo = false }: { prefillDemo?: boolean }) {
  const reduce = useReducedMotion();
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
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
      setBusy(null);
    }
  };

  // The fields arrive one after another, 60 ms apart; the card around them is already there.
  const list: Variants = { show: { transition: { staggerChildren: reduce ? 0 : 0.06, delayChildren: reduce ? 0 : 0.05 } } };
  const item = settle(reduce, 0.35);

  return (
    <motion.form
      className="mt-7 space-y-4"
      initial="hidden"
      animate="show"
      variants={list}
      onSubmit={(e) => {
        e.preventDefault();
        void signIn({ email, password }, "form");
      }}
    >
      <motion.div variants={ITEM} transition={item} className="space-y-2">
        <Label htmlFor="email" className="text-ink">
          Email
        </Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
      </motion.div>
      <motion.div variants={ITEM} transition={item} className="space-y-2">
        <Label htmlFor="password" className="text-ink">
          Password
        </Label>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
      </motion.div>
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive ring-1 ring-destructive/20">
          {error}
        </p>
      ) : null}
      <motion.div variants={ITEM} transition={item} className="pt-1">
        <Button type="submit" size="lg" className="w-full cursor-pointer rounded-xl active:scale-[0.98]" disabled={busy !== null} aria-busy={busy === "form"}>
          {busy === "form" ? <Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
          {busy === "form" ? "Signing in…" : "Sign in"}
          {busy === "form" ? null : <ArrowRightIcon data-icon="inline-end" aria-hidden />}
        </Button>
      </motion.div>
      <motion.div variants={ITEM} transition={item} className="flex items-center gap-3 text-[11px] tracking-wider text-ink-muted uppercase" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </motion.div>
      <motion.div variants={ITEM} transition={item}>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full cursor-pointer rounded-xl text-brand active:scale-[0.98]"
          disabled={busy !== null}
          aria-busy={busy === "demo"}
          onClick={() => {
            setEmail(DEMO.email);
            setPassword(DEMO.password);
            void signIn(DEMO, "demo");
          }}
        >
          {busy === "demo" ? <Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
          {busy === "demo" ? "Opening the demo…" : "Use the demo account"}
        </Button>
      </motion.div>
      <motion.p variants={ITEM} transition={item} className="text-center text-xs text-ink-muted">
        <span className="num">{DEMO.email}</span> · <span className="num">{DEMO.password}</span>
      </motion.p>
    </motion.form>
  );
}
