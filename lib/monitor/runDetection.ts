import {
  buildOfferChangeCandidates,
  dedupeOfferChangeCandidates,
  type DetectedOffer,
  type OfferChangeCandidateInsert,
} from "./offerChanges";
import { detectOffersFromItem, type FeedItemView } from "./detectOffers";

/**
 * Offer-change detection orchestration — dependency-injected, like runMonitor.
 *
 * Runs strictly AFTER a monitor run, over feed items already staged in OUR OWN
 * database. It makes ZERO network calls and NEVER touches fetching, feeds,
 * cadence, gates, or runMonitor. Its only write is staging rows into
 * `offer_change_candidates` (review_state 'new', added by insertCandidates) —
 * the existing human review-and-apply flow remains the only path to public
 * data, and nothing is ever auto-applied.
 *
 * The persistence contract is injected so this whole module is testable with a
 * fake (no DB). The production implementation lives with the other service-role
 * code (lib/admin/repos/offerChanges.ts, createDetectionPersistence).
 */

/** A resolved target offer row from our DB (feeds targetId + previousValue). */
export interface ResolvedTarget {
  id: string;
  /** The offer's current value, formatted like a proposed value ("8%", "3x"). */
  currentValue: string;
}

export interface DetectionPersistence {
  /** Recently-staged 'new' feed items to scan (bounded window + row limit). */
  listRecentNewFeedItems(sinceIso: string, limit: number): Promise<FeedItemView[]>;
  /** content_hash + detected_url of ALL existing candidates (any review_state). */
  listKnownCandidateKeys(): Promise<{ hashes: string[]; urls: string[] }>;
  /** Cashback offer for a merchant+provider, when exactly one exists. */
  resolveCashbackTarget(
    merchantId: string,
    provider: string
  ): Promise<ResolvedTarget | null>;
  /** Gift-card offer whose brand appears (uniquely) in the detected title. */
  resolveGiftCardTarget(detectedTitle: string): Promise<ResolvedTarget | null>;
  /** Points offer for a merchant, when exactly one exists. */
  resolvePointsTarget(merchantId: string): Promise<ResolvedTarget | null>;
  /** Stage the given candidate rows; returns how many NEW rows were inserted. */
  insertCandidates(rows: OfferChangeCandidateInsert[]): Promise<number>;
}

export interface DetectionSummary {
  /** Feed items scanned this run. */
  scanned: number;
  /** Raw detections produced by the heuristics (before dedupe). */
  detected: number;
  /** Unique candidates left after batch + known-key dedupe (would-be inserts). */
  deduped: number;
  /** Rows actually inserted (0 on a dry run). */
  inserted: number;
}

export interface DetectionOptions {
  /** ISO timestamp: only scan feed items staged at/after this (last-24h bound). */
  sinceIso: string;
  /** When true, report counts but insert nothing. */
  dryRun: boolean;
}

/** Hard cap on items scanned per run — see edge case 7 (bound the scan window). */
export const DETECTION_SCAN_LIMIT = 200;

/** Resolve a target (and previousValue) for one detection, or leave it null. */
async function resolveTarget(
  deps: DetectionPersistence,
  d: DetectedOffer
): Promise<ResolvedTarget | null> {
  if (d.sourceType === "cashback" && d.merchantId) {
    return deps.resolveCashbackTarget(d.merchantId, d.sourceName);
  }
  if (d.sourceType === "gift_card") {
    return deps.resolveGiftCardTarget(d.detectedTitle);
  }
  if (d.sourceType === "points" && d.merchantId) {
    return deps.resolvePointsTarget(d.merchantId);
  }
  return null;
}

/**
 * Scan recent staged feed items, detect conservative rate/discount changes,
 * resolve targets where unambiguous, and stage new candidates (unless dryRun).
 *
 * Dedupe is by content_hash within the batch AND against the hashes/urls of ALL
 * existing candidates (any review_state) — so an ignored candidate stays ignored
 * and never resurrects on a later run. previousValue comes from OUR resolved row,
 * never parsed from the feed text; when no target resolves it stays null and the
 * admin UI links or skips it.
 */
export async function runDetection(
  deps: DetectionPersistence,
  opts: DetectionOptions
): Promise<DetectionSummary> {
  const items = await deps.listRecentNewFeedItems(opts.sinceIso, DETECTION_SCAN_LIMIT);

  const detected: DetectedOffer[] = [];
  for (const item of items) {
    for (const offer of detectOffersFromItem(item)) {
      const target = await resolveTarget(deps, offer);
      detected.push(
        target
          ? { ...offer, targetId: target.id, previousValue: target.currentValue }
          : offer
      );
    }
  }

  // Build (batch-dedupe by hash) then drop anything already staged (hash OR url).
  const candidates = buildOfferChangeCandidates(detected);
  const known = await deps.listKnownCandidateKeys();
  const deduped = dedupeOfferChangeCandidates(candidates, {
    hashes: known.hashes,
    urls: known.urls,
  });

  const inserted = opts.dryRun ? 0 : await deps.insertCandidates(deduped);

  return {
    scanned: items.length,
    detected: detected.length,
    deduped: deduped.length,
    inserted,
  };
}
