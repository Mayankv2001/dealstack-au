/**
 * Daily reconciliation engine (TASK-04) — pure, injectable clock, no I/O.
 *
 * Compares canonical gift-card offers with the latest parsed source state and
 * emits the full outcome taxonomy. It WRITES NOTHING and never overwrites public
 * truth: a material change only ever becomes a reviewable "changed" candidate;
 * a non-material change is an auto-refresh instruction (last-seen/etag only);
 * source disappearance sets a `source_present = false` INTENT plus a review flag
 * and never expires or unpublishes anything by itself.
 *
 * Material-vs-non-material classification is delegated to
 * classifyOfferChange() (lib/giftcards/classifyChange.ts) — not forked. This
 * module only layers the fine-grained outcome mapping and the withdrawal /
 * unavailability / expiry / duplicate / acceptance-hint distinctions on top.
 */

import {
  classifyOfferChange,
  type ChangeKind,
} from "@/lib/giftcards/classifyChange";
import type { ExtractedOffer } from "@/lib/giftcards/extractOffer";
import { todayAU } from "@/lib/offers/expiry";
import {
  findDuplicateOffers,
  type DedupCandidate,
  type PublishedOfferSummary,
} from "@/lib/giftcards/duplicateDetection";

export type ReconcileOutcome =
  | "new-offer"
  | "unchanged"
  | "material-change"
  | "date-extension"
  | "date-reduction"
  | "changed-limit"
  | "changed-denomination"
  | "changed-cards"
  | "changed-seller"
  | "changed-value"
  | "changed-points-multiplier"
  | "changed-exclusions"
  | "changed-retailer-evidence"
  | "withdrawn"
  | "expired"
  | "source-unavailable"
  | "parse-failure"
  | "possible-duplicate"
  | "acceptance-change-hint";

export interface ReconcileItem {
  /** Canonical offer id; null for a brand-new source item with no match. */
  offerId: string | null;
  /** The canonical offer's last-known extraction (null for a new source item). */
  before: ExtractedOffer | null;
  /** The freshly parsed source item (null when the offer is missing from source). */
  after: ExtractedOffer | null;
  /** Canonical stored expiry date (YYYY-MM-DD), for confirmed-expiry detection. */
  canonicalExpiryDate?: string | null;
  /** Canonical is_ongoing flag — an ongoing offer never expires by date. */
  canonicalOngoing?: boolean;
  /** The source explicitly STATED the offer was withdrawn/removed. */
  withdrawalStated?: boolean;
  /** The source item failed to parse this run. */
  parseFailed?: boolean;
  /** The source signalled a change to denominations (not an extraction field). */
  denominationChanged?: boolean;
  /** The source signalled a change to linked retailer evidence. */
  retailerEvidenceChanged?: boolean;
  /** The source mentions a merchant/acceptance change (routed to acceptance flow). */
  acceptanceHint?: boolean;
}

export interface ReconcileResult {
  offerId: string | null;
  outcome: ReconcileOutcome;
  changedFields: string[];
  /** Material change → a reviewable "changed" candidate must be staged. */
  requiresReview: boolean;
  /** Non-material → refresh last-seen/etag only; never re-review. */
  autoRefresh: boolean;
  /** Set to false only on source-unavailable (a flag-only intent). */
  sourcePresentIntent?: boolean;
  detail?: string;
  /** Pure draft for the existing private candidate queue; never published. */
  candidateDraft?: ReconcileCandidateDraft;
}

export interface ReconcileFieldDiff {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Pure subset of the existing `StagedCandidate` boundary plus the field-level
 * evidence reviewers need. The repo supplies `rawItemId` and `sourceId`.
 */
export interface ReconcileCandidateDraft {
  extraction: ExtractedOffer;
  changeKind: ChangeKind | null;
  changedFields: string[];
  fieldDiff: ReconcileFieldDiff[];
  reviewStatus: "new" | "changed";
}

export interface ReconcileSummary {
  total: number;
  byOutcome: Partial<Record<ReconcileOutcome, number>>;
  requiresReviewCount: number;
  autoRefreshCount: number;
}

const VALUE_FIELDS = new Set([
  "discountPercent", "bonusPercent", "fixedDiscountDollars", "promoCreditDollars",
  "feeWaiverDollars", "thresholdDollars", "promotionType", "rewardDestination",
  "effectiveDiscountPercent",
]);
const POINTS_FIELDS = new Set(["pointsMultiplier", "fixedPoints", "pointsProgram"]);
const EXCLUSION_FIELDS = new Set([
  "membershipRequired", "activationRequired", "targeted", "couponRequired",
]);
const LIMIT_FIELDS = new Set(["minSpend", "purchaseLimitNote"]);

function mapMaterialOutcome(
  changed: string[],
  before: ExtractedOffer,
  after: ExtractedOffer
): ReconcileOutcome {
  if (changed.includes("expiresAt")) {
    const b = before.expiresAt;
    const a = after.expiresAt;
    // Later end (or a removed end that becomes ongoing) → extension; earlier or
    // removed end → reduction.
    if (a && (!b || a > b)) return "date-extension";
    return "date-reduction";
  }
  if (changed.includes("giftCardBrands")) return "changed-cards";
  if (changed.includes("sellerName")) return "changed-seller";
  if (changed.some((f) => POINTS_FIELDS.has(f))) return "changed-points-multiplier";
  if (changed.some((f) => VALUE_FIELDS.has(f))) return "changed-value";
  if (changed.some((f) => LIMIT_FIELDS.has(f))) return "changed-limit";
  if (changed.some((f) => EXCLUSION_FIELDS.has(f))) return "changed-exclusions";
  return "material-change";
}

function reconcileItem(item: ReconcileItem, todayStr: string): ReconcileResult {
  const base = { offerId: item.offerId, changedFields: [] as string[] };

  if (item.parseFailed) {
    return { ...base, outcome: "parse-failure", requiresReview: false, autoRefresh: false, detail: "Source item failed to parse this run." };
  }

  // Confirmed expiry: the effective end (source-parsed, else canonical) has
  // passed and the offer is not ongoing. Consumed by TASK-03's archive path.
  const effectiveEnd = item.after?.expiresAt ?? item.canonicalExpiryDate ?? item.before?.expiresAt ?? null;
  const ongoing = item.after?.isOngoing ?? item.canonicalOngoing ?? item.before?.isOngoing ?? false;

  // An explicit withdrawal is stronger evidence than the date calculation.
  if (item.before && !item.after) {
    if (item.withdrawalStated) {
      return { ...base, outcome: "withdrawn", changedFields: ["source"], requiresReview: true, autoRefresh: false, detail: "Source explicitly stated withdrawal." };
    }
    // Mere absence never creates an expiry, but a separately recorded,
    // already-passed canonical end date remains confirmed expiry evidence.
    if (item.offerId && effectiveEnd && !ongoing && effectiveEnd < todayStr) {
      return { ...base, outcome: "expired", requiresReview: false, autoRefresh: false, detail: `Confirmed end ${effectiveEnd} has passed.` };
    }
    return {
      ...base,
      outcome: "source-unavailable",
      changedFields: ["source"],
      requiresReview: true,
      autoRefresh: false,
      sourcePresentIntent: false,
      detail: "Absent from source; source_present=false intent + review flag. Not expired.",
    };
  }

  // Brand-new source item (no canonical match).
  if (!item.before && item.after) {
    return { ...base, outcome: "new-offer", requiresReview: true, autoRefresh: false };
  }

  // Both present → classify the change (reuse, not fork).
  if (item.before && item.after) {
    if (effectiveEnd && !ongoing && effectiveEnd < todayStr) {
      return { ...base, outcome: "expired", requiresReview: false, autoRefresh: false, detail: `Confirmed end ${effectiveEnd} has passed.` };
    }
    const cls = classifyOfferChange(item.before, item.after);
    // These source-side signals do not exist as extraction columns. They must
    // still be reviewable even when the extracted offer fields are identical.
    if (item.denominationChanged) {
      return { ...base, outcome: "changed-denomination", changedFields: [...new Set([...cls.changedFields, "denominations"])], requiresReview: true, autoRefresh: false };
    }
    if (item.retailerEvidenceChanged) {
      return { ...base, outcome: "changed-retailer-evidence", changedFields: [...new Set([...cls.changedFields, "retailerEvidence"])], requiresReview: true, autoRefresh: false };
    }
    const nonMaterial = cls.kind === "cosmetic" || cls.kind === "factual-non-material";
    if (nonMaterial) {
      // An acceptance/merchant hint is surfaced even when the offer itself is
      // unchanged — it is routed to the separate acceptance flow (TASK-10).
      if (item.acceptanceHint) {
        return { ...base, outcome: "acceptance-change-hint", changedFields: cls.changedFields, requiresReview: false, autoRefresh: true, detail: "Routed to acceptance reconciliation." };
      }
      // A successfully re-observed non-material item refreshes source state
      // only. The persistence boundary verifies the snapshot before counting
      // this; no public offer fact is changed.
      return { ...base, outcome: "unchanged", changedFields: cls.changedFields, requiresReview: false, autoRefresh: true };
    }
    // Material.
    return {
      ...base,
      outcome: mapMaterialOutcome(cls.changedFields, item.before, item.after),
      changedFields: cls.changedFields,
      requiresReview: true,
      autoRefresh: false,
    };
  }

  // Neither before nor after: nothing to reconcile (e.g. acceptance-only hint).
  if (item.acceptanceHint) {
    return { ...base, outcome: "acceptance-change-hint", requiresReview: false, autoRefresh: false };
  }
  return { ...base, outcome: "unchanged", requiresReview: false, autoRefresh: false };
}

const extractionValue = (
  extraction: ExtractedOffer | null,
  field: string,
): unknown => {
  if (!extraction) return null;
  if (field === "denominations" || field === "retailerEvidence") return false;
  if (field === "source") return extraction.sourcePresence;
  return (extraction as unknown as Record<string, unknown>)[field] ?? null;
};

function candidateChangeKind(outcome: ReconcileOutcome): ChangeKind | null {
  if (outcome === "new-offer") return null;
  if (outcome === "withdrawn" || outcome === "source-unavailable") {
    return "source-removed";
  }
  if (outcome === "date-extension") return "expiry-extension";
  if (outcome === "changed-cards" || outcome === "changed-denomination" ||
      outcome === "changed-retailer-evidence") {
    return "eligibility";
  }
  if (outcome === "changed-limit" || outcome === "changed-exclusions") {
    return "stacking-condition";
  }
  return "material-offer";
}

/** Map a material/review outcome to the existing private candidate shape. */
export function mapReconcileResultToCandidate(
  item: ReconcileItem,
  result: ReconcileResult,
): ReconcileCandidateDraft | null {
  if (!result.requiresReview) return null;

  let extraction = item.after;
  if (!extraction && item.before &&
      (result.outcome === "withdrawn" || result.outcome === "source-unavailable")) {
    extraction = {
      ...item.before,
      sourcePresence: "removed",
      warnings: [...item.before.warnings, result.detail ?? "Source presence needs review."],
    };
  }
  if (!extraction) return null;

  const fields = result.outcome === "new-offer"
    ? [
        "sellerName", "giftCardBrands", "promotionType", "discountPercent",
        "bonusPercent", "pointsMultiplier", "fixedPoints", "pointsProgram",
        "startsAt", "expiresAt", "isOngoing",
      ]
    : result.changedFields.length > 0
      ? result.changedFields
      : result.outcome === "withdrawn" || result.outcome === "source-unavailable"
        ? ["source"]
        : [];
  const fieldDiff = fields.map((field) => ({
    field,
    before: extractionValue(item.before, field),
    after:
      field === "denominations" || field === "retailerEvidence"
        ? true
        : extractionValue(extraction, field),
  }));

  return {
    extraction,
    changeKind: candidateChangeKind(result.outcome),
    changedFields: [...fields],
    fieldDiff,
    reviewStatus: item.offerId ? "changed" : "new",
  };
}

export function reconcileOffers(
  items: readonly ReconcileItem[],
  now: Date = new Date()
): { results: ReconcileResult[]; summary: ReconcileSummary } {
  const todayStr = todayAU(now);
  const results = items.map((item) => {
    const result = reconcileItem(item, todayStr);
    const candidateDraft = mapReconcileResultToCandidate(item, result);
    return candidateDraft ? { ...result, candidateDraft } : result;
  });

  const byOutcome: Partial<Record<ReconcileOutcome, number>> = {};
  for (const r of results) byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;

  return {
    results,
    summary: {
      total: results.length,
      byOutcome,
      requiresReviewCount: results.filter((r) => r.requiresReview).length,
      autoRefreshCount: results.filter((r) => r.autoRefresh).length,
    },
  };
}

/**
 * Advisory duplicate pass over the NEW offers a reconcile produced. Reuses
 * findDuplicateOffers (never auto-rejects). Returns the offer ids that overlap
 * an existing published offer, tagged `possible-duplicate`.
 */
export function flagPossibleDuplicates(
  newCandidates: { id: string; candidate: DedupCandidate }[],
  published: PublishedOfferSummary[],
  now: Date = new Date()
): ReconcileDuplicateAdvisory[] {
  const today = todayAU(now);
  const flagged: ReconcileDuplicateAdvisory[] = [];
  for (const { id, candidate } of newCandidates) {
    const matches = findDuplicateOffers(candidate, published, today);
    if (matches.length > 0) flagged.push({ id, outcome: "possible-duplicate", matches });
  }
  return flagged;
}

export interface ReconcileDuplicateAdvisory {
  id: string;
  outcome: "possible-duplicate";
  matches: ReturnType<typeof findDuplicateOffers>;
}
