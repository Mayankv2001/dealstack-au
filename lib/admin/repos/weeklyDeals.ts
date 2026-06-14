import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WeeklyDeal, WeeklyHighlight } from "@/lib/offers/types";
import type { Citation, Confidence } from "@/lib/sources/types";

/**
 * Admin-side weekly-deals repository — SERVICE-ROLE ONLY.
 *
 * Every function here talks to Supabase through getSupabaseAdmin(), which uses
 * the service-role key and therefore BYPASSES RLS. That is what lets the admin
 * composer read unpublished drafts and write rows that the public anon client
 * (see lib/repos/weeklyDeals.ts) can never touch. Because of that, this module
 * must only ever be imported by server code that runs behind requireAdmin() —
 * never a client component. The browser guard inside getSupabaseAdmin() is the
 * backstop.
 *
 * Weekly deals are a curated editorial view that references existing offer ids
 * via component_ids. No scraping / agents / external source calls live here — it
 * talks only to our own Supabase project.
 */

/** Which weekly card an item surfaces in (matches the DB CHECK constraint). */
export const WEEKLY_HIGHLIGHTS: WeeklyHighlight[] = [
  "best-stack",
  "gift-card",
  "points",
  "cashback",
  "signal",
  "needs-verification",
];

/** Confidence levels shared with the rest of the offer model. */
export const CONFIDENCE_LEVELS: Confidence[] = [
  "confirmed",
  "needs-verification",
  "expired-unknown",
];

// The store dropdown is identical to the cashback admin's, so reuse it rather
// than duplicate the query (both are service-role reads of `stores`).
export { listStoreOptions, type StoreOption } from "@/lib/admin/repos/cashback";

/** A weekly deal as the admin sees it — domain shape plus admin-only fields. */
export interface AdminWeeklyDeal extends WeeklyDeal {
  /** Drafts (false) are invisible on /deals but still listed in the admin. */
  isPublished: boolean;
  /** Joined store name for display; null for program-wide deals. */
  storeName: string | null;
  updatedAt: string;
}

/** Validated, normalised values ready to be written to the DB. */
export interface WeeklyDealInput {
  weekOf: string;
  merchantId: string | null;
  title: string;
  summary: string;
  highlight: WeeklyHighlight;
  componentIds: string[];
  expiryDate: string | null;
  confidence: Confidence;
  citations: Citation[];
  isPublished: boolean;
}

// ── Row mapping ──────────────────────────────────────────────────────────────
interface AdminWeeklyDealRow {
  id: string;
  week_of: string;
  merchant_id: string | null;
  title: string;
  summary: string;
  highlight: WeeklyHighlight;
  component_ids: string[] | null;
  citations: Citation[];
  expiry_date: string | null;
  confidence: Confidence;
  is_published: boolean;
  updated_at: string;
  // Embedded one-to-one store (PostgREST returns an object, but type defensively).
  store: { name: string } | { name: string }[] | null;
}

function mapAdminWeeklyDeal(r: AdminWeeklyDealRow): AdminWeeklyDeal {
  const store = Array.isArray(r.store) ? r.store[0] : r.store;
  return {
    id: r.id,
    weekOf: r.week_of,
    merchantId: r.merchant_id,
    title: r.title,
    summary: r.summary,
    highlight: r.highlight,
    componentIds: r.component_ids ?? [],
    citations: r.citations ?? [],
    expiryDate: r.expiry_date,
    confidence: r.confidence,
    isPublished: r.is_published,
    storeName: store?.name ?? null,
    updatedAt: r.updated_at,
  };
}

/**
 * Snake-case row payload for insert/update.
 *
 * NOTE: weekly_deals has NO last_checked_at column (unlike the offer tables), so
 * none is stamped here — updated_at is maintained by the DB trigger.
 */
function toRow(input: WeeklyDealInput) {
  return {
    week_of: input.weekOf,
    merchant_id: input.merchantId,
    title: input.title,
    summary: input.summary,
    highlight: input.highlight,
    component_ids: input.componentIds,
    citations: input.citations,
    expiry_date: input.expiryDate,
    confidence: input.confidence,
    is_published: input.isPublished,
  };
}

/** Lowercase, hyphenated, alnum-only slug for a readable PK segment. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "deal"
  );
}

const SELECT_WITH_STORE = "*, store:stores(name)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every weekly deal, published or not, newest week first. */
export async function listWeeklyDeals(): Promise<AdminWeeklyDeal[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("weekly_deals")
    .select(SELECT_WITH_STORE)
    .order("week_of", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listWeeklyDeals failed: ${error.message}`);
  return ((data ?? []) as unknown as AdminWeeklyDealRow[]).map(mapAdminWeeklyDeal);
}

/** A single weekly deal by id, or null when it does not exist. */
export async function getWeeklyDeal(
  id: string
): Promise<AdminWeeklyDeal | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("weekly_deals")
    .select(SELECT_WITH_STORE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getWeeklyDeal failed: ${error.message}`);
  if (!data) return null;
  return mapAdminWeeklyDeal(data as unknown as AdminWeeklyDealRow);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts a new weekly deal and returns its generated id. */
export async function insertWeeklyDeal(
  input: WeeklyDealInput
): Promise<string> {
  const db = getSupabaseAdmin();
  // Readable, collision-proof text PK: wd-<title>-<short uuid>.
  const id = `wd-${slugify(input.title)}-${randomUUID().slice(0, 8)}`;
  const { error } = await db
    .from("weekly_deals")
    .insert({ id, ...toRow(input) });
  if (error) throw new Error(`insertWeeklyDeal failed: ${error.message}`);
  return id;
}

/** Updates every editable field of an existing weekly deal. */
export async function updateWeeklyDeal(
  id: string,
  input: WeeklyDealInput
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("weekly_deals")
    .update(toRow(input))
    .eq("id", id);
  if (error) throw new Error(`updateWeeklyDeal failed: ${error.message}`);
}

/** Flips just the published flag (publish / unpublish from the list view). */
export async function setWeeklyDealPublished(
  id: string,
  isPublished: boolean
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("weekly_deals")
    .update({ is_published: isPublished })
    .eq("id", id);
  if (error) throw new Error(`setWeeklyDealPublished failed: ${error.message}`);
}
