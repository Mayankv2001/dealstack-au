import { findMerchantIdInText, normaliseText } from "@/lib/sources/normalise";
import type { OzBargainSignal, StackRecommendation } from "@/lib/offers/types";
import { isValidProductGroup } from "@/lib/offers/productGroup";
import {
  DEFAULT_SPEND,
  buildStackRecommendations,
  type StackData,
} from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";

/**
 * "Smart Stack" search.
 *
 * Instead of live-scraping on demand, this queries our approved repository rows
 * (configured Supabase is authoritative) and synthesises a result with the
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

export interface SmartStackComparison {
  kind: "comparison";
  productGroup: string;
  /** Best-priced option supplies the public heading; the key stays internal. */
  title: string;
  /** One best current signal per retailer, cheapest effective price first. */
  options: SmartStackResult[];
}

export interface SmartStackStandalone {
  kind: "standalone";
  result: SmartStackResult;
}

export type SmartStackViewItem = SmartStackComparison | SmartStackStandalone;

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
  data: StackData,
  now: Date = new Date()
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
      recommendation =
        buildStackRecommendations(merchantId, spend, data, now)[0] ?? null;
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

/** A price is comparable only when it came from the signal, not DEFAULT_SPEND. */
export function comparablePrice(result: SmartStackResult): number | null {
  if (result.signalPrice === null) return null;
  return result.recommendation?.effectivePrice ?? result.signalPrice;
}

function compareRetailerOptions(
  a: SmartStackResult,
  b: SmartStackResult
): number {
  const aPrice = comparablePrice(a);
  const bPrice = comparablePrice(b);
  if (aPrice === null && bPrice !== null) return 1;
  if (aPrice !== null && bPrice === null) return -1;
  if (aPrice !== null && bPrice !== null && aPrice !== bPrice) {
    return aPrice - bPrice;
  }
  const scoreDiff = (b.signal.signalScore ?? 0) - (a.signal.signalScore ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  return a.signal.id.localeCompare(b.signal.id);
}

function retailerId(result: SmartStackResult): string | null {
  return result.recommendation?.merchantId ?? result.signal.merchantId ?? null;
}

/**
 * Project flat results into public cards. A key only becomes a comparison when
 * it has at least two known retailers; malformed, single-retailer and
 * merchant-less groups remain standalone to avoid misleading public merges.
 */
export function buildSmartStackView(
  results: SmartStackResult[]
): SmartStackViewItem[] {
  const grouped = new Map<string, SmartStackResult[]>();
  const standalone = new Set(results);

  for (const result of results) {
    const key = result.signal.productGroup;
    if (!key || !isValidProductGroup(key)) continue;
    const members = grouped.get(key) ?? [];
    members.push(result);
    grouped.set(key, members);
  }

  const comparisons: SmartStackComparison[] = [];
  for (const [productGroup, members] of grouped) {
    const bestByRetailer = new Map<string, SmartStackResult>();
    for (const member of members) {
      const merchant = retailerId(member);
      if (!merchant) continue;
      const current = bestByRetailer.get(merchant);
      if (!current || compareRetailerOptions(member, current) < 0) {
        bestByRetailer.set(merchant, member);
      }
    }

    if (bestByRetailer.size < 2) continue;
    const options = [...bestByRetailer.values()].sort(compareRetailerOptions);
    for (const member of members) standalone.delete(member);
    comparisons.push({
      kind: "comparison",
      productGroup,
      title: options[0].signal.title,
      options,
    });
  }

  comparisons.sort((a, b) =>
    compareRetailerOptions(a.options[0], b.options[0])
  );
  return [
    ...comparisons,
    ...results
      .filter((result) => standalone.has(result))
      .map((result): SmartStackStandalone => ({ kind: "standalone", result })),
  ];
}

/** Server entry point: load the authoritative repo bundle, then build results. */
export async function loadSmartStackResults(
  query: string
): Promise<SmartStackResult[]> {
  if (!query.trim()) return [];
  const data = await loadStackData();
  return buildSmartStackResults(query, data);
}
