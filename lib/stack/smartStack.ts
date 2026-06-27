import { findMerchantIdInText, normaliseText } from "@/lib/sources/normalise";
import type { OzBargainSignal, StackRecommendation } from "@/lib/offers/types";
import {
  DEFAULT_SPEND,
  buildStackRecommendations,
  type StackData,
} from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";

/**
 * "Smart Stack" search.
 *
 * Instead of live-scraping on demand, this queries our APPROVED database rows
 * (via the repo layer, with static fallback) and synthesises a result with the
 * existing Stack Engine:
 *
 *   1. Find approved OzBargain signals whose text matches the query.
 *   2. For each match, resolve the signal's target store and run the Stack
 *      Engine for just that store, using the signal's own price as the base.
 *   3. Return the base signal price stacked with the best gift card / cashback /
 *      points layers available for that store.
 *
 * Pure where it counts: `buildSmartStackResults` takes injected `StackData` so
 * it is unit-testable without a database. `loadSmartStackResults` is the thin
 * server entry point that loads the repo bundle first.
 */

export interface SmartStackResult {
  /** The community signal that anchored this result. */
  signal: OzBargainSignal;
  /**
   * Stack for the signal's store at the signal price, or null when the store
   * has no stackable layer (e.g. Costco — listed, not synthesised).
   */
  recommendation: StackRecommendation | null;
  /** Base price parsed from the signal, or null when none could be read. */
  signalPrice: number | null;
}

/**
 * Pull the first AUD amount out of a price string.
 *   "$1,799 (was $2,199)"  → 1799
 *   "$795 member price"    → 795
 *   "½ price selected"     → null
 */
export function parsePriceText(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Query matches when every term appears in the signal's text/tags/merchant. */
function signalMatchesQuery(signal: OzBargainSignal, query: string): boolean {
  const terms = normaliseText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return false;
  const haystack = normaliseText(
    [
      signal.title,
      signal.summary,
      (signal.tags ?? []).join(" "),
      signal.merchantId ?? "",
    ].join(" ")
  );
  return terms.every((term) => haystack.includes(term));
}

/** Build Smart Stack results from an injected data bundle (testable, pure). */
export function buildSmartStackResults(
  query: string,
  data: StackData
): SmartStackResult[] {
  const q = query.trim();
  if (!q) return [];

  // Only ever consider approved signals — never pending/hidden staging rows.
  const approved = data.ozBargainSignals.filter(
    (s) => (s.status ?? "approved") === "approved"
  );
  const matched = approved.filter((s) => signalMatchesQuery(s, q));

  const results: SmartStackResult[] = matched.map((signal) => {
    const signalPrice = parsePriceText(signal.priceText);
    const merchantId = signal.merchantId ?? findMerchantIdInText(signal.title);
    let recommendation: StackRecommendation | null = null;
    if (merchantId) {
      const spend = signalPrice ?? DEFAULT_SPEND;
      // Engine resolves merchantId → that single store; empty when no layer.
      recommendation = buildStackRecommendations(merchantId, spend, data)[0] ?? null;
    }
    return { signal, recommendation, signalPrice };
  });

  // Surface signals that produced a real stack first, then by signal score.
  return results.sort((a, b) => {
    const aHas = a.recommendation ? 1 : 0;
    const bHas = b.recommendation ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return (b.signal.signalScore ?? 0) - (a.signal.signalScore ?? 0);
  });
}

/** Server entry point: load the repo bundle (DB-or-static), then build results. */
export async function loadSmartStackResults(
  query: string
): Promise<SmartStackResult[]> {
  if (!query.trim()) return [];
  const data = await loadStackData();
  return buildSmartStackResults(query, data);
}
