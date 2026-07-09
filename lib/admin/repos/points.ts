import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toNumberOrNull } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { PointsOffer } from "@/lib/offers/types";
import type { Citation, Confidence } from "@/lib/sources/types";

/**
 * Admin-side points repository — SERVICE-ROLE ONLY.
 *
 * Every function here talks to Supabase through getSupabaseAdmin(), which uses
 * the service-role key and therefore BYPASSES RLS. That is what lets the admin
 * panel read unpublished drafts and write rows that the public anon client (see
 * lib/repos/offers.ts) can never touch. Because of that, this module must only
 * ever be imported by server code that runs behind requireAdmin() — never from a
 * client component. The browser guard inside getSupabaseAdmin() is the backstop.
 *
 * Points offers can be program-wide (merchant_id null) or tied to a store. No
 * scraping / agents / external source calls live here — it talks only to our own
 * Supabase project.
 */

/** How the points are earned (matches the DB CHECK constraint). */
export const POINTS_MECHANISMS = [
  "in-store-boost",
  "card-linked",
  "shopping-portal",
  "base-earn",
] as const;
export type PointsMechanism = (typeof POINTS_MECHANISMS)[number];

/** Confidence levels shared with the rest of the offer model. */
export const CONFIDENCE_LEVELS: Confidence[] = [
  "confirmed",
  "needs-verification",
  "expired-unknown",
];

// The store dropdown is identical to the cashback admin's, so reuse it rather
// than duplicate the query (both are service-role reads of `stores`).
export { listStoreOptions, type StoreOption } from "@/lib/admin/repos/cashback";

/** A points offer as the admin sees it — domain shape plus admin-only fields. */
export interface AdminPointsOffer extends PointsOffer {
  /** Drafts (false) are invisible on /deals but still listed in the admin. */
  isPublished: boolean;
  /** Joined store name for display; null for program-wide offers. */
  storeName: string | null;
  updatedAt: string;
}

/** Validated, normalised values ready to be written to the DB. */
export interface PointsOfferInput {
  merchantId: string | null;
  program: string;
  earnRateDisplay: string;
  earnMultiple: number | null;
  pointValueCents: number | null;
  mechanism: PointsMechanism;
  expiryDate: string | null;
  confidence: Confidence;
  citations: Citation[];
  isPublished: boolean;
}

// ── Row mapping ──────────────────────────────────────────────────────────────
interface AdminPointsRow {
  id: string;
  merchant_id: string | null;
  program: string;
  earn_rate_display: string;
  earn_multiple: number | string | null;
  point_value_cents: number | string | null;
  mechanism: PointsMechanism;
  expiry_date: string | null;
  citations: Citation[];
  confidence: Confidence;
  last_checked_at: string;
  is_published: boolean;
  updated_at: string;
  // Embedded one-to-one store (PostgREST returns an object, but type defensively).
  store: { name: string } | { name: string }[] | null;
}

function mapAdminPoints(r: AdminPointsRow): AdminPointsOffer {
  const store = Array.isArray(r.store) ? r.store[0] : r.store;
  return {
    id: r.id,
    merchantId: r.merchant_id,
    program: r.program,
    earnRateDisplay: r.earn_rate_display,
    earnMultiple: toNumberOrNull(r.earn_multiple),
    pointValueCents: toNumberOrNull(r.point_value_cents),
    mechanism: r.mechanism,
    expiryDate: r.expiry_date,
    citations: r.citations ?? [],
    confidence: r.confidence,
    lastCheckedAt: r.last_checked_at,
    isPublished: r.is_published,
    storeName: store?.name ?? null,
    updatedAt: r.updated_at,
  };
}

/** Snake-case row payload for insert/update. */
function toRow(input: PointsOfferInput) {
  return {
    merchant_id: input.merchantId,
    program: input.program,
    earn_rate_display: input.earnRateDisplay,
    earn_multiple: input.earnMultiple,
    point_value_cents: input.pointValueCents,
    mechanism: input.mechanism,
    expiry_date: input.expiryDate,
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
      .slice(0, 40) || "program"
  );
}

const SELECT_WITH_STORE = "*, store:stores(name)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every points offer, published or not, newest-edited first. */
export async function listPointsOffers(): Promise<AdminPointsOffer[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("points_offers")
    .select(SELECT_WITH_STORE)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listPointsOffers failed: ${error.message}`);
  return ((data ?? []) as unknown as AdminPointsRow[]).map(mapAdminPoints);
}

/** A single offer by id, or null when it does not exist. */
export async function getPointsOffer(
  id: string
): Promise<AdminPointsOffer | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("points_offers")
    .select(SELECT_WITH_STORE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getPointsOffer failed: ${error.message}`);
  if (!data) return null;
  return mapAdminPoints(data as unknown as AdminPointsRow);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts a new offer and returns its generated id. */
export async function insertPointsOffer(
  input: PointsOfferInput
): Promise<string> {
  const db = getSupabaseAdmin();
  // Readable, collision-proof text PK: pts-<program>-<short uuid>.
  const id = `pts-${slugify(input.program)}-${randomUUID().slice(0, 8)}`;
  const { error } = await db
    .from("points_offers")
    .insert({ id, ...toRow(input) });
  if (error) throw new Error(`insertPointsOffer failed: ${error.message}`);
  return id;
}

/** Updates every editable field of an existing offer. */
export async function updatePointsOffer(
  id: string,
  input: PointsOfferInput
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("points_offers")
    .update(toRow(input))
    .eq("id", id);
  if (error) throw new Error(`updatePointsOffer failed: ${error.message}`);
}

/** Flips just the published flag (publish / unpublish from the list view). */
export async function setPointsPublished(
  id: string,
  isPublished: boolean
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("points_offers")
    .update({ is_published: isPublished })
    .eq("id", id);
  if (error) throw new Error(`setPointsPublished failed: ${error.message}`);
}
