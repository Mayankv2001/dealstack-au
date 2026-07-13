"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AlertCriteriaKind } from "@/lib/alerts/types";

export default function EmailAlertForm() {
  const [kind, setKind] = useState<AlertCriteriaKind>("store");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/alerts/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: formData.get("email"), kind: formData.get("kind"), key: formData.get("key"), website: formData.get("website") }) });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      setMessage({ ok: response.ok, text: response.ok ? result.message ?? "Check your email to confirm." : result.error ?? "Could not request this alert." });
    } finally {
      setPending(false);
    }
  }

  const needsKey = kind !== "expiring-soon";
  return <form action={submit} className="mt-6 space-y-4 rounded-2xl border bg-card p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Email address<Input type="email" name="email" required autoComplete="email" /></label><label className="grid gap-1.5 text-sm font-medium">Alert type<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as AlertCriteriaKind)} className="h-10 rounded-lg border bg-background px-3"><option value="store">Store</option><option value="gift-card-brand">Gift-card brand</option><option value="programme">Rewards programme</option><option value="expiring-soon">Offers expiring soon</option></select></label>{needsKey ? <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">{kind === "store" ? "Store" : kind === "gift-card-brand" ? "Gift-card brand" : "Rewards programme"}<Input name="key" required maxLength={100} placeholder={kind === "store" ? "e.g. JB Hi-Fi" : kind === "gift-card-brand" ? "e.g. Apple" : "e.g. Everyday Rewards"} /></label> : null}</div><label className="hidden" aria-hidden="true">Website<Input name="website" tabIndex={-1} autoComplete="off" /></label><p className="text-xs leading-relaxed text-muted-foreground">We will send a confirmation link first. No account is created. Every alert includes a one-click unsubscribe link.</p><Button disabled={pending}>{pending ? "Requesting…" : "Request email alert"}</Button>{message ? <p role="status" className={message.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{message.text}</p> : null}</form>;
}
