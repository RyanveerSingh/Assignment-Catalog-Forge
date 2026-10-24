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
import { FIELD, ITEM } from "../login/login-form";

const FIELDS = [
  { id: "name", label: "Your name", type: "text", autoComplete: "name", minLength: 1 },
  { id: "storeName", label: "Store name", type: "text", autoComplete: "organization", minLength: 2 },
  { id: "email", label: "Email", type: "email", autoComplete: "email", minLength: 3 },
  { id: "password", label: "Password", type: "password", autoComplete: "new-password", minLength: 8 },
] as const;

type FieldId = (typeof FIELDS)[number]["id"];

export function SignupForm() {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [values, setValues] = useState<Record<FieldId, string>>({ name: "", storeName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signUp = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/signup", { method: "POST", json: values });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account");
      setBusy(false);
    }
  };

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
        void signUp();
      }}
    >
      {FIELDS.map((f) => (
        <motion.div key={f.id} variants={ITEM} transition={item} className="space-y-2">
          <Label htmlFor={f.id} className="text-ink">
            {f.label}
          </Label>
          <Input
            id={f.id}
            type={f.type}
            autoComplete={f.autoComplete}
            minLength={f.minLength}
            required
            value={values[f.id]}
            onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            className={FIELD}
          />
          {f.id === "password" ? <p className="text-xs text-ink-muted">At least 8 characters.</p> : null}
        </motion.div>
      ))}
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive ring-1 ring-destructive/20">
          {error}
        </p>
      ) : null}
      <motion.div variants={ITEM} transition={item} className="pt-1">
        <Button type="submit" size="lg" className="w-full cursor-pointer rounded-xl active:scale-[0.98]" disabled={busy} aria-busy={busy}>
          {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
          {busy ? "Creating your store…" : "Create account"}
          {busy ? null : <ArrowRightIcon data-icon="inline-end" aria-hidden />}
        </Button>
      </motion.div>
      <motion.p variants={ITEM} transition={item} className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
          Sign in
        </Link>
      </motion.p>
    </motion.form>
  );
}
