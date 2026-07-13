import { createHmac, randomBytes } from "node:crypto";
import { ALERT_CRITERIA_KINDS, type AlertCriteria, type AlertCriteriaKind } from "./types";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseAlertKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

export function parseAlertRequest(input: unknown): { ok: true; email: string; criteria: AlertCriteria } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  const body = input as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const kind = typeof body.kind === "string" ? body.kind : "";
  const rawKey = typeof body.key === "string" ? body.key : "";
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!(ALERT_CRITERIA_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Choose a valid alert type." };
  const criteriaKind = kind as AlertCriteriaKind;
  const key = criteriaKind === "expiring-soon" ? null : normaliseAlertKey(rawKey);
  if (criteriaKind !== "expiring-soon" && !key) return { ok: false, error: "Enter the store, gift-card brand or programme." };
  return { ok: true, email, criteria: { kind: criteriaKind, key } };
}

export function newAlertToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAlertToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/** A production alert link must be rooted at a bare HTTPS application origin. */
export function normaliseAlertBaseUrl(value: string): string | null {
  const safe = safeHttpsUrl(value.endsWith("/") ? value : `${value}/`);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

/** Reconstructable server-side so every future alert can carry unsubscribe. */
export function unsubscribeTokenForSubscription(subscriptionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe|${subscriptionId}`).digest("base64url");
}

/** Stable across a repeated subscription request, without exposing the email. */
export function unsubscribeTokenForCriteria(
  email: string,
  criteria: AlertCriteria,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`unsubscribe|${email}|${criteria.kind}|${criteria.key ?? ""}`)
    .digest("base64url");
}
