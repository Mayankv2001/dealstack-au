import { createHash } from "node:crypto";
import { stripHtml } from "./mapFeedItem";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Offer-change detection helpers — PURE / OFFLINE ONLY (no network, no DB).
 *
 * This is the testable core of the "offer change monitoring" workflow. It turns
 * a *detected* offer (cashback rate, gift-card discount, points offer or promo)
 * into a row shaped for the `offer_change_candidates` staging table, de-dupes
 * candidates, and decides what an admin "Apply" would change — WITHOUT touching
 * the database or making any request.
 *
 * Safety posture (mirrors the feed monitor):
 *   - nothing here fetches, logs in, or bypasses bot protection;
 *   - `selectMonitorableSources` only ever keeps sources we have verified
 *     feed/API support for (the safe-source gate);
 *   - `planOfferApplication` only yields a write plan for a candidate still in
 *     review with a resolved target — so ignored / duplicate / applied items can
 *     never change public data, and nothing is ever auto-applied.
 */

// ── Offer (candidate) source types ───────────────────────────────────────────
export const OFFER_SOURCE_TYPES = [
  "cashback",
  "gift_card",
  "points",
  "promo",
  "card_offer",
] as const;
export type OfferSourceType = (typeof OFFER_SOURCE_TYPES)[number];

export type OfferChangeConfidence =
  | "confirmed"
  | "needs-verification"
  | "expired-unknown";

export const OFFER_CHANGE_REVIEW_STATES = [
  "new",
  "applied",
  "ignored",
  "duplicate",
] as const;
export type OfferChangeReviewState = (typeof OFFER_CHANGE_REVIEW_STATES)[number];

// ── Source registry tags ─────────────────────────────────────────────────────
/** Registry tags a feed/source can be classified as. */
export const FEED_SOURCE_TYPES = [
  "ozbargain",
  "pointhacks",
  "freepoints",
  "gcdb",
  "provider-feed",
  "manual-url",
] as const;
export type FeedSourceType = (typeof FEED_SOURCE_TYPES)[number];

export function isFeedSourceType(value: string): value is FeedSourceType {
  return (FEED_SOURCE_TYPES as readonly string[]).includes(value);
}

/**
 * Source types we have VERIFIED RSS/Atom/API support for and will actually fetch
 * in Phase 1. Everything else is registry-only: it can be recorded and tagged,
 * but the monitor skips it — we never crawl arbitrary pages or hit unverified
 * APIs. Expanding this list requires verified feed/API support first.
 */
export const APPROVED_FEED_SOURCE_TYPES: readonly FeedSourceType[] = [
  "ozbargain",
];

export function isApprovedForFetch(sourceType: string): boolean {
  return (APPROVED_FEED_SOURCE_TYPES as readonly string[]).includes(sourceType);
}

/** The subset of a feed source the safe-source gate needs. */
export interface MonitorableSource {
  id: string;
  sourceType: string;
  isEnabled: boolean;
}

/**
 * Safe-source gate: keep only sources that are BOTH enabled AND of a verified
 * feed/API type. Disabled sources and unapproved source types are dropped — they
 * are never fetched. This is the "only monitor safe sources" rule in one place.
 */
export function selectMonitorableSources<T extends MonitorableSource>(
  sources: T[]
): T[] {
  return sources.filter((s) => s.isEnabled && isApprovedForFetch(s.sourceType));
}

// ── Candidate building ───────────────────────────────────────────────────────
/** A change detected from an approved source, before it is staged. */
export interface DetectedOffer {
  sourceType: OfferSourceType;
  /** Provider / source name, e.g. "ShopBack", "OzBargain". */
  sourceName: string;
  merchantId?: string | null;
  /** The specific offer row this change updates on apply (null when unknown). */
  targetId?: string | null;
  detectedTitle: string;
  detectedRateOrDiscount?: string;
  detectedUrl?: string;
  previousValue?: string | null;
  proposedValue: string;
  confidence?: OfferChangeConfidence;
  rawSummary?: string;
  /**
   * Structured fields a single rate/discount string cannot carry (e.g. a
   * card offer's bonus points AND annual fee at once). Admin-review prefill
   * only — never read by the apply planner. Defaults to `{}`.
   */
  payload?: Record<string, Json>;
}

/** Shaped for an `offer_change_candidates` insert (server adds review_state, ts). */
export interface OfferChangeCandidateInsert {
  source_type: OfferSourceType;
  source_name: string;
  merchant_id: string | null;
  target_id: string | null;
  detected_title: string;
  detected_rate_or_discount: string;
  detected_url: string;
  previous_value: string | null;
  proposed_value: string;
  confidence: OfferChangeConfidence;
  raw_summary: string;
  content_hash: string;
  payload: Record<string, Json>;
}

const SUMMARY_MAX = 500;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Stable hash identifying a detected change. Same source + merchant + url +
 * proposed value → same hash, so re-detecting an unchanged offer is a no-op and
 * a genuinely new value produces a new candidate.
 */
export function buildOfferChangeContentHash(d: {
  sourceType: string;
  sourceName: string;
  merchantId?: string | null;
  detectedUrl?: string;
  proposedValue: string;
}): string {
  return sha256(
    [
      d.sourceType,
      d.sourceName.trim().toLowerCase(),
      (d.merchantId ?? "").trim().toLowerCase(),
      (d.detectedUrl ?? "").trim().toLowerCase(),
      d.proposedValue.trim().toLowerCase(),
    ].join("\n")
  );
}

/** Map one detected offer into a candidate insert (normalised + hashed). */
export function buildOfferChangeCandidate(
  d: DetectedOffer
): OfferChangeCandidateInsert {
  const detectedUrl = (d.detectedUrl ?? "").trim();
  const proposedValue = d.proposedValue.trim();
  const summary = stripHtml(d.rawSummary ?? "").slice(0, SUMMARY_MAX);
  return {
    source_type: d.sourceType,
    source_name: d.sourceName.trim(),
    merchant_id: d.merchantId ?? null,
    target_id: d.targetId ?? null,
    detected_title: stripHtml(d.detectedTitle).trim() || "(untitled)",
    detected_rate_or_discount: (d.detectedRateOrDiscount ?? "").trim(),
    detected_url: detectedUrl,
    previous_value: d.previousValue ?? null,
    proposed_value: proposedValue,
    confidence: d.confidence ?? "needs-verification",
    raw_summary: summary,
    content_hash: buildOfferChangeContentHash({
      sourceType: d.sourceType,
      sourceName: d.sourceName,
      merchantId: d.merchantId,
      detectedUrl,
      proposedValue,
    }),
    payload: d.payload ?? {},
  };
}

/** Build many, de-duplicating WITHIN the batch by content_hash (first wins). */
export function buildOfferChangeCandidates(
  list: DetectedOffer[]
): OfferChangeCandidateInsert[] {
  const seen = new Set<string>();
  const out: OfferChangeCandidateInsert[] = [];
  for (const d of list) {
    const candidate = buildOfferChangeCandidate(d);
    if (seen.has(candidate.content_hash)) continue;
    seen.add(candidate.content_hash);
    out.push(candidate);
  }
  return out;
}

/** Existing staged rows to de-dupe against. */
export interface KnownCandidates {
  hashes?: Iterable<string>;
  urls?: Iterable<string>;
}

/**
 * Drop candidates that already exist — matched by content_hash OR by a non-empty
 * detected_url. This is the duplicate-detection guard the monitor runs before
 * inserting, so re-runs never create duplicate review items.
 */
export function dedupeOfferChangeCandidates(
  candidates: OfferChangeCandidateInsert[],
  known: KnownCandidates = {}
): OfferChangeCandidateInsert[] {
  const knownHashes = new Set(known.hashes ?? []);
  const knownUrls = new Set(
    [...(known.urls ?? [])].map((u) => u.trim().toLowerCase()).filter(Boolean)
  );
  const seenHash = new Set<string>();
  const seenUrl = new Set<string>();
  const out: OfferChangeCandidateInsert[] = [];
  for (const candidate of candidates) {
    if (knownHashes.has(candidate.content_hash)) continue;
    if (seenHash.has(candidate.content_hash)) continue;
    const url = candidate.detected_url.trim().toLowerCase();
    if (url && (knownUrls.has(url) || seenUrl.has(url))) continue;
    seenHash.add(candidate.content_hash);
    if (url) seenUrl.add(url);
    out.push(candidate);
  }
  return out;
}

// ── Apply planning (what an admin "Apply" would change) ──────────────────────
export type OfferTable =
  | "cashback_offers"
  | "gift_card_offers"
  | "points_offers"
  | "stores"
  | "card_offers";

/**
 * Which table + numeric column each candidate source type applies to. A
 * source type with NO entry here cannot be applied yet — planOfferApplication
 * refuses it with a clear skip instead of crashing on a missing key.
 * `card_offer` is handled separately because one reviewed detection can carry
 * more than one numeric field.
 */
const OFFER_TARGET: Partial<
  Record<OfferSourceType, { table: OfferTable; column: string }>
> = {
  cashback: { table: "cashback_offers", column: "rate_percent" },
  gift_card: { table: "gift_card_offers", column: "discount_percent" },
  points: { table: "points_offers", column: "earn_multiple" },
  promo: { table: "stores", column: "discount_percent" },
};

/** Offer tables that carry a last_checked_at column (stores does not). */
export function hasLastCheckedAt(table: OfferTable): boolean {
  return table !== "stores";
}

/** Pull the first numeric value out of a free-text rate/discount string. */
export function parseRateValue(text: string): number | null {
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

export interface ScalarApplyPlan {
  table: OfferTable;
  column: string;
  id: string;
  value: number;
}
export interface CardApplyPlan {
  table: "card_offers";
  id: string;
  changes: {
    bonus_points?: number;
    annual_fee?: number;
  };
}
export type ApplyPlan = ScalarApplyPlan | CardApplyPlan;
export interface ApplySkip {
  skip: string;
}

/** The candidate fields the apply planner needs. */
export interface ApplyCandidateView {
  sourceType: OfferSourceType;
  reviewState: OfferChangeReviewState;
  targetId: string | null;
  proposedValue: string;
  payload?: Record<string, unknown>;
}

function cardField(
  payload: Record<string, unknown>,
  key: "bonusPoints" | "annualFee",
  max: number,
  integer = false
): number | null {
  const value = payload[key];
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    return null;
  }
  return value;
}

/**
 * Decide whether/what an Apply would change — PURE, no writes. Returns a write
 * plan ONLY for a candidate that is still in review (`new`), has a resolved
 * target offer row, and a numeric proposed value. Anything ignored, duplicate
 * or already applied yields a skip, so reviewed-away items can never change
 * public data and nothing is ever auto-applied.
 */
export function planOfferApplication(
  c: ApplyCandidateView
): ApplyPlan | ApplySkip {
  if (c.reviewState !== "new") {
    return { skip: `candidate is already ${c.reviewState}` };
  }
  if (!c.targetId) {
    return { skip: "no target offer is linked to this candidate" };
  }
  if (c.sourceType === "card_offer") {
    const payload = c.payload ?? {};
    const bonusPoints = cardField(payload, "bonusPoints", 10_000_000, true);
    const annualFee = cardField(payload, "annualFee", 100_000);
    const changes: CardApplyPlan["changes"] = {};
    if (bonusPoints !== null) changes.bonus_points = bonusPoints;
    if (annualFee !== null) changes.annual_fee = annualFee;
    if (Object.keys(changes).length === 0) {
      return { skip: "card candidate has no valid detected fields" };
    }
    return { table: "card_offers", id: c.targetId, changes };
  }
  const value = parseRateValue(c.proposedValue);
  if (value === null) {
    return { skip: "proposed value is not numeric" };
  }
  const target = OFFER_TARGET[c.sourceType];
  if (!target) {
    return {
      skip: `automated apply is not yet supported for ${c.sourceType} candidates`,
    };
  }
  return { table: target.table, column: target.column, id: c.targetId, value };
}

export function isApplyPlan(plan: ApplyPlan | ApplySkip): plan is ApplyPlan {
  return "table" in plan;
}

export function isCardApplyPlan(plan: ApplyPlan): plan is CardApplyPlan {
  return plan.table === "card_offers" && "changes" in plan;
}

export function isScalarApplyPlan(plan: ApplyPlan): plan is ScalarApplyPlan {
  return "column" in plan;
}
