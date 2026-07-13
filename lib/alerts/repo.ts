import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { emailAlertTokenSecret } from "@/lib/env";
import { matchingAlertCandidates } from "./matching";
import { hashAlertToken, normaliseAlertKey, unsubscribeTokenForCriteria } from "./validation";
import type { AlertCandidate, AlertCriteria, AlertCriteriaKind } from "./types";

type UntypedTable = "stores";
const table = (name: string) => getSupabaseAdmin().from(name as UntypedTable);

interface SubscriptionRow {
  id: string;
  email: string;
  criteria_kind: AlertCriteriaKind;
  criteria_key: string | null;
  status: "pending" | "active" | "unsubscribed" | "bounced";
}

export interface RequestAlertInput {
  email: string;
  criteria: AlertCriteria;
  confirmationTokenHash: string;
  requestFingerprint: string;
  confirmationUrl: string;
  baseUrl: string;
}

export type RequestAlertResult = "queued" | "already-active" | "rate-limited";

export async function requestEmailAlert(input: RequestAlertInput): Promise<RequestAlertResult> {
  const subscriptionId = randomUUID();
  const unsubscribeToken = unsubscribeTokenForCriteria(
    input.email,
    input.criteria,
    emailAlertTokenSecret()
  );
  const unsubscribeTokenHash = hashAlertToken(unsubscribeToken, emailAlertTokenSecret());
  const unsubscribeUrl = `${input.baseUrl}/api/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const result = await getSupabaseAdmin().rpc(
    "request_email_alert_subscription" as "consume_admin_rate_limit",
    {
      p_subscription_id: subscriptionId,
      p_email: input.email,
      p_criteria_kind: input.criteria.kind,
      p_criteria_key: input.criteria.key,
      p_confirmation_token_hash: input.confirmationTokenHash,
      p_unsubscribe_token_hash: unsubscribeTokenHash,
      p_request_fingerprint: input.requestFingerprint,
      p_confirmation_url: input.confirmationUrl,
      p_unsubscribe_url: unsubscribeUrl,
    } as never
  );
  if (result.error) throw new Error(result.error.message);
  const state = result.data as unknown;
  if (
    state !== "queued" &&
    state !== "already-active" &&
    state !== "rate-limited"
  ) {
    throw new Error("Email alert request returned an invalid state.");
  }
  return state;
}

export async function confirmEmailAlert(tokenHash: string): Promise<boolean> {
  const found = await table("email_alert_subscriptions").select("id").filter("confirmation_token_hash", "eq", tokenHash).filter("status", "eq", "pending").maybeSingle();
  if (found.error) throw new Error(found.error.message);
  const id = (found.data as unknown as { id: string } | null)?.id;
  if (!id) return false;
  const updated = await table("email_alert_subscriptions").update({ status: "active", confirmed_at: new Date().toISOString() } as never).eq("id", id).filter("status", "eq", "pending");
  if (updated.error) throw new Error(updated.error.message);
  const cancelled = await table("email_alert_outbox").update({ status: "cancelled" } as never).filter("subscription_id", "eq", id).filter("message_kind", "eq", "confirmation").filter("status", "eq", "pending");
  if (cancelled.error) throw new Error(cancelled.error.message);
  return true;
}

export async function unsubscribeEmailAlert(tokenHash: string): Promise<boolean> {
  const found = await table("email_alert_subscriptions").select("id").filter("unsubscribe_token_hash", "eq", tokenHash).filter("status", "in", "(pending,active)").maybeSingle();
  if (found.error) throw new Error(found.error.message);
  const id = (found.data as unknown as { id: string } | null)?.id;
  if (!id) return false;
  const updated = await table("email_alert_subscriptions").update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() } as never).eq("id", id);
  if (updated.error) throw new Error(updated.error.message);
  const cancelled = await table("email_alert_outbox").update({ status: "cancelled" } as never).filter("subscription_id", "eq", id).filter("status", "in", "(pending,sending)");
  if (cancelled.error) throw new Error(cancelled.error.message);
  return true;
}

interface OfferRow {
  id: string;
  brand: string;
  purchase_location: string | null;
  promotion_type: string;
  discount_percent: number | null;
  bonus_percent: number | null;
  points_multiplier: number | null;
  points_program: string | null;
  expiry_date: string | null;
}

interface CashbackAlertRow {
  id: string;
  merchant_id: string;
  provider: string;
  rate_percent: number;
  flat_amount: number | null;
  expiry_date: string | null;
}

interface PointsAlertRow {
  id: string;
  merchant_id: string | null;
  program: string;
  earn_rate_display: string;
  expiry_date: string | null;
}

interface WeeklyAlertRow {
  id: string;
  merchant_id: string | null;
  title: string;
  highlight: string;
  expiry_date: string | null;
}

function candidateValue(row: OfferRow): string {
  if ((row.discount_percent ?? 0) > 0) return `${row.discount_percent}% off`;
  if ((row.bonus_percent ?? 0) > 0) return `${row.bonus_percent}% bonus value`;
  if ((row.points_multiplier ?? 0) > 0) return `${row.points_multiplier}× ${row.points_program ?? "points"}`;
  return row.promotion_type.replaceAll("-", " ");
}

export function offerAlertCandidate(row: OfferRow): AlertCandidate {
  return {
    dedupeKey: `gift-card:${row.id}:${row.expiry_date ?? "ongoing"}`,
    title: `${row.brand}${row.purchase_location ? ` at ${row.purchase_location}` : ""}`,
    detailPath: `/gift-cards/${encodeURIComponent(row.id)}`,
    storeKey: row.purchase_location ? normaliseAlertKey(row.purchase_location) : null,
    giftCardBrandKey: normaliseAlertKey(row.brand),
    programmeKey: row.points_program ? normaliseAlertKey(row.points_program) : null,
    expiryDate: row.expiry_date,
    valueLabel: candidateValue(row),
  };
}

export function cashbackAlertCandidate(row: CashbackAlertRow): AlertCandidate {
  const storeKey = normaliseAlertKey(row.merchant_id);
  return {
    dedupeKey: `cashback:${row.id}:${row.expiry_date ?? "ongoing"}`,
    title: `${row.merchant_id} cashback via ${row.provider}`,
    detailPath: `/search?q=${encodeURIComponent(row.merchant_id)}`,
    storeKey,
    giftCardBrandKey: null,
    programmeKey: null,
    expiryDate: row.expiry_date,
    valueLabel: row.flat_amount != null ? `$${row.flat_amount} cashback` : `${row.rate_percent}% cashback`,
  };
}

export function pointsAlertCandidate(row: PointsAlertRow): AlertCandidate {
  return {
    dedupeKey: `points:${row.id}:${row.expiry_date ?? "ongoing"}`,
    title: row.merchant_id ? `${row.program} at ${row.merchant_id}` : row.program,
    detailPath: row.merchant_id
      ? `/search?q=${encodeURIComponent(row.merchant_id)}`
      : `/rewards/${normaliseAlertKey(row.program)}`,
    storeKey: row.merchant_id ? normaliseAlertKey(row.merchant_id) : null,
    giftCardBrandKey: null,
    programmeKey: normaliseAlertKey(row.program),
    expiryDate: row.expiry_date,
    valueLabel: row.earn_rate_display,
  };
}

export function weeklyAlertCandidate(row: WeeklyAlertRow): AlertCandidate {
  return {
    dedupeKey: `weekly:${row.id}:${row.expiry_date ?? "ongoing"}`,
    title: row.title,
    detailPath: row.merchant_id
      ? `/search?q=${encodeURIComponent(row.merchant_id)}`
      : "/deals",
    storeKey: row.merchant_id ? normaliseAlertKey(row.merchant_id) : null,
    giftCardBrandKey: null,
    programmeKey: null,
    expiryDate: row.expiry_date,
    valueLabel: row.highlight,
  };
}

export async function queueCurrentAlertMessages(today: string, baseUrl: string): Promise<number> {
  const [subscriptions, offers, cashback, points, weekly] = await Promise.all([
    table("email_alert_subscriptions").select("id, email, criteria_kind, criteria_key, status").filter("status", "eq", "active"),
    getSupabaseAdmin().from("gift_card_offers").select("id, brand, purchase_location, promotion_type, discount_percent, bonus_percent, points_multiplier, points_program, expiry_date").eq("is_published", true).or(`expiry_date.is.null,expiry_date.gte.${today}`),
    getSupabaseAdmin().from("cashback_offers").select("id, merchant_id, provider, rate_percent, flat_amount, expiry_date").eq("is_published", true).or(`expiry_date.is.null,expiry_date.gte.${today}`),
    getSupabaseAdmin().from("points_offers").select("id, merchant_id, program, earn_rate_display, expiry_date").eq("is_published", true).or(`expiry_date.is.null,expiry_date.gte.${today}`),
    getSupabaseAdmin().from("weekly_deals").select("id, merchant_id, title, highlight, expiry_date").eq("is_published", true).or(`expiry_date.is.null,expiry_date.gte.${today}`),
  ]);
  if (subscriptions.error) throw new Error(subscriptions.error.message);
  if (offers.error) throw new Error(offers.error.message);
  if (cashback.error) throw new Error(cashback.error.message);
  if (points.error) throw new Error(points.error.message);
  if (weekly.error) throw new Error(weekly.error.message);
  const candidates = [
    ...((offers.data ?? []) as unknown as OfferRow[]).map(offerAlertCandidate),
    ...((cashback.data ?? []) as unknown as CashbackAlertRow[]).map(cashbackAlertCandidate),
    ...((points.data ?? []) as unknown as PointsAlertRow[]).map(pointsAlertCandidate),
    ...((weekly.data ?? []) as unknown as WeeklyAlertRow[]).map(weeklyAlertCandidate),
  ];
  const secret = emailAlertTokenSecret();
  const rows = ((subscriptions.data ?? []) as unknown as SubscriptionRow[]).flatMap((subscription) => {
    const criteria = {
      kind: subscription.criteria_kind,
      key: subscription.criteria_key,
    } as const;
    const unsubscribeToken = unsubscribeTokenForCriteria(
      subscription.email,
      criteria,
      secret
    );
    return matchingAlertCandidates(criteria, candidates, today).map((candidate) => ({ subscription_id: subscription.id, message_kind: "alert", dedupe_key: candidate.dedupeKey, recipient_email: subscription.email, payload: { title: candidate.title, valueLabel: candidate.valueLabel, expiryDate: candidate.expiryDate, detailUrl: `${baseUrl}${candidate.detailPath}`, unsubscribeUrl: `${baseUrl}/api/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}` } }));
  });
  if (rows.length === 0) return 0;
  const inserted = await table("email_alert_outbox").upsert(rows as never, { onConflict: "subscription_id,message_kind,dedupe_key", ignoreDuplicates: true });
  if (inserted.error) throw new Error(inserted.error.message);
  return rows.length;
}

export interface AlertOutboxRow {
  id: string;
  subscription_id: string;
  message_kind: "confirmation" | "alert";
  recipient_email: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export async function claimAlertOutbox(limit = 25): Promise<AlertOutboxRow[]> {
  const result = await getSupabaseAdmin().rpc("claim_email_alert_outbox" as "consume_admin_rate_limit", { p_limit: Math.min(50, Math.max(1, limit)) } as never);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as unknown as AlertOutboxRow[];
}

export async function markAlertSent(row: AlertOutboxRow): Promise<void> {
  const sent = await table("email_alert_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null } as never).eq("id", row.id).filter("status", "eq", "sending");
  if (sent.error) throw new Error(sent.error.message);
  await table("email_alert_subscriptions").update({ last_sent_at: new Date().toISOString() } as never).eq("id", row.subscription_id);
}

export async function returnAlertForRetry(row: AlertOutboxRow, message: string): Promise<void> {
  const retryMinutes = Math.min(24 * 60, 2 ** Math.min(row.attempts, 10));
  const status = row.attempts >= 5 ? "cancelled" : "pending";
  const nextAttempt = new Date(Date.now() + retryMinutes * 60_000).toISOString();
  const failed = await table("email_alert_outbox").update({ status, next_attempt_at: nextAttempt, last_error: message.slice(0, 500) } as never).eq("id", row.id).filter("status", "eq", "sending");
  if (failed.error) throw new Error(failed.error.message);
}

/** Remove delivery/rate-limit records after their documented retention window. */
export async function pruneAlertData(): Promise<void> {
  const result = await getSupabaseAdmin().rpc(
    "prune_email_alert_data" as "consume_admin_rate_limit"
  );
  if (result.error) throw new Error(result.error.message);
}
