import { allSourceResults } from "./manualData";
import {
  deriveConfidence,
  findMerchantIdInText,
  normaliseText,
} from "./normalise";
import { rankResults } from "./ranking";
import {
  SOURCE_META,
  type Citation,
  type DealSourceResult,
  type RankedDealResult,
} from "./types";

/**
 * Static/mock pipeline: searches the hand-written sample results only.
 * No network access — real adapters will feed the same shape later.
 */

function haystack(result: DealSourceResult): string {
  return normaliseText(
    [
      result.title,
      result.merchant,
      result.merchantId,
      result.summary,
      result.source,
      SOURCE_META[result.source].displayName,
      result.kind,
      result.pointsProgram,
      result.giftCardBrand,
      result.cardOrProvider,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/**
 * Cross-source dedupe. Two results merge when they share merchant, kind
 * and the same headline saving (discount % / points / gift card brand).
 * The higher-trust result wins; the loser survives as a citation and
 * fills any missing fields. Expiry keeps the earliest (conservative),
 * lastCheckedAt the latest.
 */
export function dedupeResults(
  results: DealSourceResult[]
): RankedDealResult[] {
  const merged = new Map<string, RankedDealResult>();
  let unmergeable = 0;

  for (const result of results) {
    const signal =
      result.discountPercent ?? result.pointsAmount ?? result.giftCardBrand;
    const key =
      result.merchantId && signal !== null
        ? `${result.merchantId}|${result.kind}|${signal}`
        : `unique-${unmergeable++}|${result.id}`;

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...result,
        score: 0,
        citations: [{ source: result.source, sourceUrl: result.sourceUrl }],
      });
      continue;
    }

    const citation: Citation = {
      source: result.source,
      sourceUrl: result.sourceUrl,
    };
    const incomingWins =
      SOURCE_META[result.source].trustWeight >
      SOURCE_META[existing.source].trustWeight;
    const winner = incomingWins ? result : existing;
    const loser = incomingWins ? existing : result;

    merged.set(key, {
      ...existing,
      ...(incomingWins ? result : {}),
      // Fill the winner's gaps from the loser
      summary: winner.summary || loser.summary,
      expiryDate: earliest(existing.expiryDate, result.expiryDate),
      lastCheckedAt: latest(existing.lastCheckedAt, result.lastCheckedAt),
      confidence:
        existing.confidence === "confirmed" || result.confidence === "confirmed"
          ? "confirmed"
          : winner.confidence,
      citations: [...existing.citations, citation],
      score: 0,
    });
  }

  return [...merged.values()];
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function latest(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Core search over ANY pool of source results. Every word in the query must
 * match somewhere across title, merchant, summary, source, kind, program, gift
 * card brand or provider. An empty query returns everything. Results come back
 * deduped, scored and ranked, expired items last.
 *
 * Parameterised on `results` so the same pipeline serves both the static sample
 * pool (below) and the Supabase-backed pool (lib/repos/sourceResults.ts).
 */
export function rankSourceResults(
  results: DealSourceResult[],
  query: string
): RankedDealResult[] {
  const now = new Date();
  const terms = normaliseText(query).split(" ").filter(Boolean);
  const queryMerchantId = findMerchantIdInText(query);

  const matches = results.filter((result) => {
    if (terms.length === 0) return true;
    const text = haystack(result);
    return terms.every(
      (term) =>
        text.includes(term) ||
        // The query's resolved store also matches its results
        (queryMerchantId !== null && result.merchantId === queryMerchantId)
    );
  });

  const deduped = dedupeResults(matches).map((result) => ({
    ...result,
    // Stamp display confidence so the UI never shows "confirmed" past expiry
    confidence: deriveConfidence(result, now),
  }));

  return rankResults(deduped, { queryMerchantId, now });
}

/** Core: every result in `results` for one store, deduped + derived + ranked. */
export function rankSourceResultsForStore(
  results: DealSourceResult[],
  storeId: string
): RankedDealResult[] {
  const now = new Date();
  const matches = results.filter((r) => r.merchantId === storeId);
  const deduped = dedupeResults(matches).map((result) => ({
    ...result,
    confidence: deriveConfidence(result, now),
  }));
  return rankResults(deduped, { queryMerchantId: storeId, now });
}

/** Search the STATIC sample pool — the fallback when Supabase is unavailable. */
export function searchSources(query: string): RankedDealResult[] {
  return rankSourceResults(allSourceResults, query);
}

/** Static-pool results for a specific store — the Supabase fallback path. */
export function sourceResultsForStore(storeId: string): RankedDealResult[] {
  return rankSourceResultsForStore(allSourceResults, storeId);
}
