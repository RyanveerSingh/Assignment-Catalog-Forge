"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { settle } from "@/components/ext/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/client/api";

export const ITEM: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };
export const FIELD = "h-11 rounded-xl border-input bg-paper px-3.5 text-[15px] focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/25";

export function LoginForm() {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
      setBusy(false);
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
        void signIn();
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
        <Button type="submit" size="lg" className="w-full cursor-pointer rounded-xl active:scale-[0.98]" disabled={busy} aria-busy={busy}>
          {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
          {busy ? "Signing in…" : "Sign in"}
          {busy ? null : <ArrowRightIcon data-icon="inline-end" aria-hidden />}
        </Button>
      </motion.div>
      <motion.p variants={ITEM} transition={item} className="text-center text-sm text-ink-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
          Create an account
        </Link>
      </motion.p>
    </motion.form>
  );
}
