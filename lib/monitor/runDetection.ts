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
  /**
   * Card offer whose provider narrows to exactly one row (or, with several
   * cards under that issuer, the one whose card_name also appears in the
   * detected title). Zero or ambiguous matches return null — the admin
   * either links it manually or creates a new draft.
   */
  resolveCardOfferTarget(
    provider: string,
    detectedTitle: string
  ): Promise<ResolvedTarget | null>;
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
  /** Present ONLY when includeCandidates was set — the deduped would-be inserts. */
  candidates?: OfferChangeCandidateInsert[];
}

export interface DetectionOptions {
  /** ISO timestamp: only scan feed items staged at/after this (last-24h bound). */
  sinceIso: string;
  /** When true, report counts but insert nothing. */
  dryRun: boolean;
  /** When true, the summary carries the deduped would-be inserts. Leave unset
   *  on the cron path — raw titles must not enter the route JSON. */
  includeCandidates?: boolean;
  /**
   * Independent of, and additional to, the overall detection step (which the
   * caller already gates on OZB_OFFER_DETECT_ENABLED before calling this at
   * all). Defaults to false — card_offer detections are dropped before
   * staging unless explicitly enabled, so CARD_DETECT_ENABLED can go live
   * separately from the cashback/gift_card/points detectors that have been
   * running longer. The dry-run preview action passes true unconditionally,
   * the same way it already ignores the main detection flag, since preview
   * exists precisely to show what detection WOULD stage before enabling it.
   */
  enableCardOffers?: boolean;
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
  if (d.sourceType === "card_offer") {
    return deps.resolveCardOfferTarget(d.sourceName, d.detectedTitle);
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
  const enableCardOffers = opts.enableCardOffers ?? false;

  const detected: DetectedOffer[] = [];
  for (const item of items) {
    for (const offer of detectOffersFromItem(item)) {
      // Card detection has its own, independent kill switch — dropped here,
      // before resolution/staging, when the caller has not enabled it.
      if (offer.sourceType === "card_offer" && !enableCardOffers) continue;
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
    ...(opts.includeCandidates ? { candidates: deduped } : {}),
  };
}
