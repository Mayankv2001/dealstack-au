import { randomUUID } from "node:crypto";
import {
  cardOfferPublishErrorMessage,
  type CardOfferReadinessInput,
} from "@/lib/offers/cardReadiness";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toNumberOrNull } from "@/lib/supabase/server";
import type { Confidence } from "@/lib/sources/types";

/**
 * Admin-side card-offer repository — SERVICE-ROLE ONLY.
 *
 * Every function here talks to Supabase through getSupabaseAdmin(), which uses
 * the service-role key and therefore BYPASSES RLS. That is what lets the admin
 * panel read unpublished drafts and write rows that the public anon client can
 * never touch. Because of that, this module must only ever be imported by
 * server code that runs behind requireAdmin() — never from a client component.
 *
 * Manual entry only: no scraping / fetching / agents / external source calls
 * live here — it talks only to our own Supabase project. See
 * docs/bank-card-offer-workflow.md for the design rationale.
 */

/** Kinds of card offer (matches the DB CHECK constraint). */
export const OFFER_TYPES = [
  "sign_up_bonus",
  "cashback",
  "statement_credit",
  "points_bonus",
  "annual_fee_discount",
] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

/** Confidence levels shared with the rest of the offer model. */
export const CONFIDENCE_LEVELS: Confidence[] = [
  "confirmed",
  "needs-verification",
  "expired-unknown",
];

/** A card offer as the admin sees it. */
export interface AdminCardOffer {
  id: string;
  provider: string;
  cardName: string;
  offerType: OfferType;
  bonusPoints: number | null;
  cashbackAmount: number | null;
  statementCreditAmount: number | null;
  minimumSpend: number | null;
  minimumSpendPeriod: string | null;
  annualFee: number | null;
  eligibilityNotes: string;
  offerSummary: string;
  sourceUrl: string;
  confidence: Confidence;
  expiryDate: string | null;
  lastCheckedAt: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Validated, normalised values ready to be written to the DB. */
export interface CardOfferInput {
  provider: string;
  cardName: string;
  offerType: OfferType;
  bonusPoints: number | null;
  cashbackAmount: number | null;
  statementCreditAmount: number | null;
  minimumSpend: number | null;
  minimumSpendPeriod: string | null;
  annualFee: number | null;
  eligibilityNotes: string;
  offerSummary: string;
  sourceUrl: string;
  confidence: Confidence;
  expiryDate: string | null;
  isPublished: boolean;
}

export type CardOfferMutationResult = { ok: true } | { ok: false; error: string };
export type CardOfferInsertResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// ── Row mapping ──────────────────────────────────────────────────────────────
interface CardOfferRow {
  id: string;
  provider: string;
  card_name: string;
  offer_type: OfferType;
  bonus_points: number | string | null;
  cashback_amount: number | string | null;
  statement_credit_amount: number | string | null;
  minimum_spend: number | string | null;
  minimum_spend_period: string | null;
  annual_fee: number | string | null;
  eligibility_notes: string;
  offer_summary: string;
  source_url: string;
  confidence: Confidence;
  expiry_date: string | null;
  last_checked_at: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

function mapAdminCardOffer(r: CardOfferRow): AdminCardOffer {
  return {
    id: r.id,
    provider: r.provider,
    cardName: r.card_name,
    offerType: r.offer_type,
    bonusPoints: toNumberOrNull(r.bonus_points),
    cashbackAmount: toNumberOrNull(r.cashback_amount),
    statementCreditAmount: toNumberOrNull(r.statement_credit_amount),
    minimumSpend: toNumberOrNull(r.minimum_spend),
    minimumSpendPeriod: r.minimum_spend_period,
    annualFee: toNumberOrNull(r.annual_fee),
    eligibilityNotes: r.eligibility_notes,
    offerSummary: r.offer_summary,
    sourceUrl: r.source_url,
    confidence: r.confidence,
    expiryDate: r.expiry_date,
    lastCheckedAt: r.last_checked_at,
    isPublished: r.is_published,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Snake-case row payload for insert/update. */
function toRow(input: CardOfferInput) {
  return {
    provider: input.provider,
    card_name: input.cardName,
    offer_type: input.offerType,
    bonus_points: input.bonusPoints,
    cashback_amount: input.cashbackAmount,
    statement_credit_amount: input.statementCreditAmount,
    minimum_spend: input.minimumSpend,
    minimum_spend_period: input.minimumSpendPeriod,
    annual_fee: input.annualFee,
    eligibility_notes: input.eligibilityNotes,
    offer_summary: input.offerSummary,
    source_url: input.sourceUrl,
    confidence: input.confidence,
    expiry_date: input.expiryDate,
    is_published: input.isPublished,
    // The admin is hand-verifying the data on every save, so stamp it now.
    last_checked_at: new Date().toISOString(),
  };
}

/** Lowercase, hyphenated, alnum-only slug for a readable PK segment. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "card"
  );
}

/** Expected validation failure for a write that would leave the row published. */
function publicationError(
  offer: CardOfferReadinessInput,
  isPublished: boolean
): string | null {
  return isPublished ? cardOfferPublishErrorMessage(offer) : null;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every card offer, published or not, newest-edited first. */
export async function listCardOffers(): Promise<AdminCardOffer[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("card_offers")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listCardOffers failed: ${error.message}`);
  return ((data ?? []) as unknown as CardOfferRow[]).map(mapAdminCardOffer);
}

/** A single offer by id, or null when it does not exist. */
export async function getCardOffer(id: string): Promise<AdminCardOffer | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("card_offers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCardOffer failed: ${error.message}`);
  if (!data) return null;
  return mapAdminCardOffer(data as unknown as CardOfferRow);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts an offer, unless it would create a non-ready published row. */
export async function insertCardOffer(
  input: CardOfferInput
): Promise<CardOfferInsertResult> {
  const publishError = publicationError(input, input.isPublished);
  if (publishError) return { ok: false, error: publishError };

  const db = getSupabaseAdmin();
  // Readable, collision-proof text PK: card-<provider>-<short uuid>.
  const id = `card-${slugify(input.provider)}-${randomUUID().slice(0, 8)}`;
  const { error } = await db.from("card_offers").insert({ id, ...toRow(input) });
  if (error) throw new Error(`insertCardOffer failed: ${error.message}`);
  return { ok: true, id };
}

/** Updates every editable field of an existing offer. */
export async function updateCardOffer(
  id: string,
  input: CardOfferInput
): Promise<CardOfferMutationResult> {
  const publishError = publicationError(input, input.isPublished);
  if (publishError) return { ok: false, error: publishError };

  const db = getSupabaseAdmin();
  const { error } = await db.from("card_offers").update(toRow(input)).eq("id", id);
  if (error) throw new Error(`updateCardOffer failed: ${error.message}`);
  return { ok: true };
}

/** Flips the published flag; publishing first checks the persisted row. */
export async function setCardOfferPublished(
  id: string,
  isPublished: boolean
): Promise<CardOfferMutationResult> {
  if (isPublished) {
    const offer = await getCardOffer(id);
    if (!offer) {
      return { ok: false, error: "Cannot publish: card offer was not found." };
    }
    const publishError = publicationError(offer, true);
    if (publishError) return { ok: false, error: publishError };
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("card_offers")
    .update({ is_published: isPublished })
    .eq("id", id);
  if (error) throw new Error(`setCardOfferPublished failed: ${error.message}`);
  return { ok: true };
}
