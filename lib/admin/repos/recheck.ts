import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { RecentItemType } from "./dashboard";

/**
 * "Mark re-checked" support — SERVICE-ROLE ONLY.
 *
 * Backs the dashboard data-quality "Mark re-checked" button: it bumps ONLY
 * `last_checked_at` on one row so the weekly "I verified this at the source, the
 * value is still right" ritual clears the `stale` flag without a full edit-form
 * round-trip. It changes no offer values and publishes nothing.
 *
 * The allow-list below is the injection boundary: the flag `type` arrives back
 * from the client as an arbitrary string, so a table name must ONLY ever come
 * from a lookup in this map — never from the input. Types whose table has no
 * `last_checked_at` column (stores, weekly_deals) are deliberately absent.
 */

/** Flag types that map to a table with a `last_checked_at` column. */
export const RECHECKABLE_TABLES = {
  cashback: "cashback_offers",
  giftCards: "gift_card_offers",
  points: "points_offers",
  cardOffers: "card_offers",
  signals: "ozbargain_signals",
} as const satisfies Partial<Record<RecentItemType, string>>;

export type RecheckableType = keyof typeof RECHECKABLE_TABLES;

/**
 * The table for a flag type, or null when the type is not re-checkable. Pure —
 * exported for the action's validation and for tests. Never interpolate the
 * input `type` into SQL; use only the returned allow-list value.
 */
export function recheckTableFor(type: string): string | null {
  // Object.hasOwn (not a bare index) so inherited keys like "__proto__" or
  // "toString" resolve to null rather than a prototype value.
  return Object.hasOwn(RECHECKABLE_TABLES, type)
    ? (RECHECKABLE_TABLES as Record<string, string>)[type]
    : null;
}

/**
 * Bump `last_checked_at` to now on exactly one row. The trailing `.select("id")`
 * makes PostgREST return the updated rows, so an id that matched nothing (row
 * deleted between render and click) throws a clear error instead of silently
 * "succeeding" on a zero-row update.
 */
export async function touchLastCheckedAt(
  type: RecheckableType,
  id: string
): Promise<void> {
  const table = RECHECKABLE_TABLES[type];
  const db = getSupabaseAdmin();
  const checkedAt = new Date().toISOString();
  const update =
    type === "signals"
      ? { last_checked_at: checkedAt, last_validated_at: checkedAt }
      : { last_checked_at: checkedAt };
  const { data, error } = await db
    .from(table)
    .update(update as never)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`touchLastCheckedAt ${table} failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("Row not found — it may have been removed since this page loaded.");
  }
}
