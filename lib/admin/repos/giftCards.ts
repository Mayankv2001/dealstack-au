import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toNumber, toNumberOrNull } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { GiftCardOffer } from "@/lib/offers/types";
import type { Citation, Confidence } from "@/lib/sources/types";
import type { GiftCardPublishFacts } from "@/lib/giftcards/publishReadiness";

/**
 * Admin-side gift-card repository — SERVICE-ROLE ONLY.
 *
 * Every function here talks to Supabase through getSupabaseAdmin(), which uses
 * the service-role key and therefore BYPASSES RLS. That is what lets the admin
 * panel read unpublished drafts and write rows that the public anon client (see
 * lib/repos/offers.ts) can never touch. Because of that, this module must only
 * ever be imported by server code that runs behind requireAdmin() — never from a
 * client component. The browser guard inside getSupabaseAdmin() is the backstop.
 *
 * No scraping / agents / external source calls live here — it talks only to our
 * own Supabase project.
 */

/** Channels a gift card can come through (matches the DB CHECK constraint). */
export const GIFT_CARD_CHANNELS = [
  "membership-portal",
  "supermarket-promo",
  "bank-benefit",
] as const;
export type GiftCardChannel = (typeof GIFT_CARD_CHANNELS)[number];

/** How the card is bought (matches the DB CHECK constraint). */
export const PURCHASE_METHODS = [
  "online",
  "in-store",
  "online-and-in-store",
  "unknown",
] as const;
export type PurchaseMethod = (typeof PURCHASE_METHODS)[number];

/** Confidence levels shared with the rest of the offer model. */
export const CONFIDENCE_LEVELS: Confidence[] = [
  "confirmed",
  "needs-verification",
  "expired-unknown",
];

// The store dropdown is identical to the cashback admin's, so reuse it rather
// than duplicate the query (both are service-role reads of `stores`).
export { listStoreOptions, type StoreOption } from "@/lib/admin/repos/cashback";

/** A gift-card offer as the admin sees it — domain shape plus admin-only fields. */
export interface AdminGiftCardOffer extends GiftCardOffer {
  /** Drafts (false) are invisible on /deals but still listed in the admin. */
  isPublished: boolean;
  updatedAt: string;
}

/** Validated, normalised values ready to be written to the DB. */
export interface GiftCardOfferInput {
  brand: string;
  discountPercent: number;
  channel: GiftCardChannel;
  source: string;
  acceptedAtMerchantIds: string[];
  pointsOnPurchase: { program: string; earnNote: string } | null;
  capDollars: number | null;
  startDate: string | null;
  expiryDate: string | null;
  purchaseLocation: string | null;
  purchaseMethod: PurchaseMethod | null;
  limitPerCustomer: string | null;
  acceptedAt: string[];
  usageNotes: string[];
  stackNotes: string[];
  sourceDetailUrl: string | null;
  citations: Citation[];
  confidence: Confidence;
  isPublished: boolean;
}

// ── Row mapping ──────────────────────────────────────────────────────────────
interface AdminGiftCardRow {
  id: string;
  brand: string;
  discount_percent: number | string;
  channel: GiftCardChannel;
  source: string;
  accepted_at_merchant_ids: string[] | null;
  points_on_purchase: { program: string; earnNote: string } | null;
  cap_dollars: number | string | null;
  start_date: string | null;
  expiry_date: string | null;
  purchase_location: string | null;
  purchase_method: PurchaseMethod | null;
  limit_per_customer: string | null;
  accepted_at: string[] | null;
  usage_notes: string[] | null;
  stack_notes: string[] | null;
  source_detail_url: string | null;
  citations: Citation[];
  confidence: Confidence;
  last_checked_at: string;
  is_published: boolean;
  updated_at: string;
}

function mapAdminGiftCard(r: AdminGiftCardRow): AdminGiftCardOffer {
  return {
    id: r.id,
    brand: r.brand,
    discountPercent: toNumber(r.discount_percent),
    channel: r.channel,
    source: r.source,
    acceptedAtMerchantIds: r.accepted_at_merchant_ids ?? [],
    pointsOnPurchase: r.points_on_purchase ?? null,
    capDollars: toNumberOrNull(r.cap_dollars),
    startDate: r.start_date,
    expiryDate: r.expiry_date,
    purchaseLocation: r.purchase_location ?? undefined,
    purchaseMethod: r.purchase_method ?? undefined,
    limitPerCustomer: r.limit_per_customer ?? undefined,
    acceptedAt: r.accepted_at ?? undefined,
    usageNotes: r.usage_notes ?? undefined,
    stackNotes: r.stack_notes ?? undefined,
    sourceDetailUrl: r.source_detail_url ?? undefined,
    citations: r.citations ?? [],
    confidence: r.confidence,
    lastCheckedAt: r.last_checked_at,
    isPublished: r.is_published,
    updatedAt: r.updated_at,
  };
}

/** Snake-case row payload for insert/update. */
function toRow(input: GiftCardOfferInput) {
  return {
    brand: input.brand,
    discount_percent: input.discountPercent,
    channel: input.channel,
    source: input.source,
    accepted_at_merchant_ids: input.acceptedAtMerchantIds,
    points_on_purchase: input.pointsOnPurchase as Json | null,
    cap_dollars: input.capDollars,
    start_date: input.startDate,
    expiry_date: input.expiryDate,
    purchase_location: input.purchaseLocation,
    purchase_method: input.purchaseMethod,
    limit_per_customer: input.limitPerCustomer,
    accepted_at: input.acceptedAt,
    usage_notes: input.usageNotes,
    stack_notes: input.stackNotes,
    source_detail_url: input.sourceDetailUrl,
    citations: input.citations as unknown as Json,
    confidence: input.confidence,
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

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every gift-card offer, published or not, newest-edited first. */
export async function listGiftCardOffers(): Promise<AdminGiftCardOffer[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_card_offers")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listGiftCardOffers failed: ${error.message}`);
  return ((data ?? []) as unknown as AdminGiftCardRow[]).map(mapAdminGiftCard);
}

/** A single offer by id, or null when it does not exist. */
export async function getGiftCardOffer(
  id: string
): Promise<AdminGiftCardOffer | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_card_offers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getGiftCardOffer failed: ${error.message}`);
  if (!data) return null;
  return mapAdminGiftCard(data as unknown as AdminGiftCardRow);
}

/** Canonical facts for the publish toggle's fail-closed readiness gate. */
export async function getGiftCardPublishFacts(
  id: string
): Promise<GiftCardPublishFacts | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_card_offers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getGiftCardPublishFacts failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const numberOrNull = (value: unknown) =>
    value == null ? null : Number(value);
  return {
    brand: typeof row.brand === "string" ? row.brand : null,
    seller:
      typeof row.seller_name === "string"
        ? row.seller_name
        : typeof row.purchase_location === "string"
          ? row.purchase_location
          : null,
    sourceUrl:
      typeof row.source_detail_url === "string" ? row.source_detail_url : null,
    // No "discount" default: a row without a declared mechanic must fail the
    // publish gate explicitly, not masquerade as a discount.
    promotionType:
      typeof row.promotion_type === "string" ? row.promotion_type : null,
    discountPercent: numberOrNull(row.discount_percent),
    bonusPercent: numberOrNull(row.bonus_percent),
    pointsMultiplier: numberOrNull(row.points_multiplier),
    fixedPoints: numberOrNull(row.fixed_points),
    pointsProgram:
      typeof row.points_program === "string" ? row.points_program : null,
    fixedDiscountDollars: numberOrNull(row.fixed_discount_dollars),
    promoCreditDollars: numberOrNull(row.promo_credit_dollars),
    thresholdDollars: numberOrNull(row.threshold_dollars),
    membershipRequired: row.membership_required === true,
    expiryDate: typeof row.expiry_date === "string" ? row.expiry_date : null,
    isOngoing: row.is_ongoing === true,
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts a new offer and returns its generated id. */
export async function insertGiftCardOffer(
  input: GiftCardOfferInput
): Promise<string> {
  const db = getSupabaseAdmin();
  // Readable, collision-proof text PK: gc-<brand>-<short uuid>.
  const id = `gc-${slugify(input.brand)}-${randomUUID().slice(0, 8)}`;
  const { error } = await db
    .from("gift_card_offers")
    .insert({ id, ...toRow(input) });
  if (error) throw new Error(`insertGiftCardOffer failed: ${error.message}`);
  return id;
}

/** Updates every editable field of an existing offer. */
export async function updateGiftCardOffer(
  id: string,
  input: GiftCardOfferInput
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("gift_card_offers")
    .update(toRow(input))
    .eq("id", id);
  if (error) throw new Error(`updateGiftCardOffer failed: ${error.message}`);
}

/** Flips just the published flag (publish / unpublish from the list view). */
export async function setGiftCardPublished(
  id: string,
  isPublished: boolean
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("gift_card_offers")
    .update({ is_published: isPublished })
    .eq("id", id);
  if (error) throw new Error(`setGiftCardPublished failed: ${error.message}`);
}
