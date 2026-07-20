import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { GiftCardLifecycleSchemaUnavailableError } from "@/lib/admin/repos/giftCardLifecycle";
import { stageCandidate } from "@/lib/admin/repos/giftCardPipeline";
import type {
  ExtractedOffer,
  PromotionType,
  RewardDestination,
} from "@/lib/giftcards/extractOffer";
import type {
  ConfirmedOfferInput,
} from "@/lib/giftcards/reconcilePredictions";
import type {
  ReconcileItem,
  ReconcileResult,
} from "@/lib/giftcards/reconcileOffers";

/**
 * Stored-data boundary for daily gift-card reconciliation.
 *
 * This module never fetches a source and never writes a public offer. Approved
 * candidates are the reviewed baseline, while the bounded extraction in the
 * corresponding raw item is the newest stored source snapshot. Reconciliation
 * can therefore repair/stage private review work without crossing the approval
 * boundary.
 */

const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const OPEN_REVIEW_STATES = ["new", "changed"];

export function isMissingGiftCardReconcileSchemaError(error: {
  code?: string | null;
} | null | undefined): boolean {
  return MISSING_SCHEMA_CODES.has(error?.code ?? "");
}

export interface StoredReconcileRawRow {
  id: string;
  source_id: string;
  content_hash: string;
  raw_payload: {
    extraction?: unknown;
    extractions?: unknown;
  } | null;
  processing_status: string;
  parser_error: string | null;
  last_seen_at: string;
  updated_at: string;
}

export interface StoredReconcileCandidateRow {
  id: string;
  raw_item_id: string;
  source_id: string;
  seller_name: string | null;
  gift_card_brands: string[] | null;
  promotion_type: string;
  discount_percent: number | string | null;
  bonus_percent: number | string | null;
  points_multiplier: number | string | null;
  points_program: string | null;
  effective_discount_percent: number | string | null;
  starts_at: string | null;
  expires_at: string | null;
  terms_json: Record<string, unknown> | null;
  extraction_confidence: number | string;
  extraction_warnings: string[] | null;
  review_status: string;
  approved_offer_id: string | null;
  created_at: string;
}

export interface StoredOfferReconcileRecord {
  key: string;
  sourceId: string;
  rawItemId: string;
  subOfferKey: string;
  snapshotHash: string;
  rawUpdatedAt: string;
  item: ReconcileItem;
}

const PROMOTION_TYPES = new Set<PromotionType>([
  "discount",
  "fixed-dollar-discount",
  "bonus-value",
  "points",
  "promo-credit",
  "fee-waiver",
  "membership",
  "mixed",
  "unknown",
]);
const REWARD_DESTINATIONS = new Set<RewardDestination>([
  "checkout-discount",
  "gift-card-value",
  "seller-credit",
  "loyalty-points",
  "waived-fee",
]);

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;
const booleanValue = (value: unknown, fallback = false): boolean =>
  value === true ? true : value === false ? false : fallback;
const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];

function promotionType(value: unknown): PromotionType {
  return PROMOTION_TYPES.has(value as PromotionType)
    ? (value as PromotionType)
    : "unknown";
}

function rewardDestination(value: unknown): RewardDestination | null {
  return REWARD_DESTINATIONS.has(value as RewardDestination)
    ? (value as RewardDestination)
    : null;
}

/** Strict enough to reject malformed/partial raw payloads instead of staging
 * invented defaults, while preserving older extractor-v1 snapshots. */
export function extractionFromStoredPayload(value: unknown): ExtractedOffer | null {
  const row = objectValue(value);
  if (
    !row ||
    typeof row.subOfferKey !== "string" ||
    typeof row.promotionType !== "string" ||
    !Array.isArray(row.giftCardBrands)
  ) {
    return null;
  }
  return {
    subOfferKey: row.subOfferKey || "primary",
    parentIsCompound: booleanValue(row.parentIsCompound),
    sourcePresence: row.sourcePresence === "removed" ? "removed" : "present",
    promotionType: promotionType(row.promotionType),
    rewardDestination: rewardDestination(row.rewardDestination),
    sellerName: stringOrNull(row.sellerName),
    giftCardBrands: stringArray(row.giftCardBrands),
    discountPercent: numberOrNull(row.discountPercent),
    bonusPercent: numberOrNull(row.bonusPercent),
    pointsMultiplier: numberOrNull(row.pointsMultiplier),
    fixedPoints: numberOrNull(row.fixedPoints),
    pointsProgram: stringOrNull(row.pointsProgram),
    fixedDiscountDollars: numberOrNull(row.fixedDiscountDollars),
    promoCreditDollars: numberOrNull(row.promoCreditDollars),
    feeWaiverDollars: numberOrNull(row.feeWaiverDollars),
    thresholdDollars: numberOrNull(row.thresholdDollars),
    effectiveDiscountPercent: numberOrNull(row.effectiveDiscountPercent),
    startsAt: stringOrNull(row.startsAt),
    expiresAt: stringOrNull(row.expiresAt),
    isOngoing: booleanValue(row.isOngoing),
    sourceMarkedExpired: booleanValue(row.sourceMarkedExpired),
    whileStocksLast: booleanValue(row.whileStocksLast),
    membershipRequired: booleanValue(row.membershipRequired),
    activationRequired: booleanValue(row.activationRequired),
    couponRequired: booleanValue(row.couponRequired),
    targeted: booleanValue(row.targeted),
    minSpend: numberOrNull(row.minSpend),
    purchaseLimitNote: stringOrNull(row.purchaseLimitNote),
    confidence: numberOrNull(row.confidence) ?? 0,
    warnings: stringArray(row.warnings),
    ...(objectValue(row.weeklyFacts)
      ? { weeklyFacts: row.weeklyFacts as ExtractedOffer["weeklyFacts"] }
      : {}),
  };
}

function extractionFromCandidate(
  row: StoredReconcileCandidateRow,
): ExtractedOffer {
  const terms = row.terms_json ?? {};
  const subOfferKey = stringOrNull(terms.subOfferKey) ?? "primary";
  return {
    subOfferKey,
    parentIsCompound: booleanValue(terms.parentIsCompound),
    sourcePresence: terms.sourcePresence === "removed" ? "removed" : "present",
    promotionType: promotionType(row.promotion_type),
    rewardDestination: rewardDestination(terms.rewardDestination),
    sellerName: row.seller_name,
    giftCardBrands: row.gift_card_brands ?? [],
    discountPercent: numberOrNull(row.discount_percent),
    bonusPercent: numberOrNull(row.bonus_percent),
    pointsMultiplier: numberOrNull(row.points_multiplier),
    fixedPoints: numberOrNull(terms.fixedPoints),
    pointsProgram: row.points_program,
    fixedDiscountDollars: numberOrNull(terms.fixedDiscountDollars),
    promoCreditDollars: numberOrNull(terms.promoCreditDollars),
    feeWaiverDollars: numberOrNull(terms.feeWaiverDollars),
    thresholdDollars: numberOrNull(terms.thresholdDollars),
    effectiveDiscountPercent: numberOrNull(row.effective_discount_percent),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isOngoing: booleanValue(terms.isOngoing),
    sourceMarkedExpired: booleanValue(terms.sourceMarkedExpired),
    whileStocksLast: booleanValue(terms.whileStocksLast),
    membershipRequired: booleanValue(terms.membershipRequired),
    activationRequired: booleanValue(terms.activationRequired),
    couponRequired: booleanValue(terms.couponRequired),
    targeted: booleanValue(terms.targeted),
    minSpend: numberOrNull(terms.minSpend),
    purchaseLimitNote: stringOrNull(terms.purchaseLimitNote),
    confidence: numberOrNull(row.extraction_confidence) ?? 0,
    warnings: row.extraction_warnings ?? [],
    ...(objectValue(terms.weeklyFacts)
      ? { weeklyFacts: terms.weeklyFacts as ExtractedOffer["weeklyFacts"] }
      : {}),
  };
}

function candidateSubOfferKey(row: StoredReconcileCandidateRow): string {
  return stringOrNull(row.terms_json?.subOfferKey) ?? "primary";
}

function atOrAfter(left: string, right: string): boolean {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? leftTime >= rightTime
    : left >= right;
}

/** Pure projection used by the production loader and production-shaped tests. */
export function buildStoredOfferReconcileRecords(
  rawRows: readonly StoredReconcileRawRow[],
  candidateRows: readonly StoredReconcileCandidateRow[],
  eligibleCanonicalOfferIds?: ReadonlySet<string>,
): StoredOfferReconcileRecord[] {
  const candidatesByRawAndKey = new Map<string, StoredReconcileCandidateRow[]>();
  for (const candidate of candidateRows) {
    const groupKey = `${candidate.raw_item_id}:${candidateSubOfferKey(candidate)}`;
    const group = candidatesByRawAndKey.get(groupKey) ?? [];
    group.push(candidate);
    candidatesByRawAndKey.set(groupKey, group);
  }
  for (const group of candidatesByRawAndKey.values()) {
    group.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const records: StoredOfferReconcileRecord[] = [];
  for (const raw of rawRows) {
    const payload = raw.raw_payload ?? {};
    const rawValues = Array.isArray(payload.extractions)
      ? payload.extractions
      : payload.extraction != null
        ? [payload.extraction]
        : [];
    const parsed = rawValues.map(extractionFromStoredPayload);
    const malformed = parsed.some((value) => value == null);
    const extractions = parsed.filter((value): value is ExtractedOffer => value != null);
    const extractionByKey = new Map(extractions.map((value) => [value.subOfferKey, value]));
    const keys = new Set(extractionByKey.keys());
    for (const groupKey of candidatesByRawAndKey.keys()) {
      const prefix = `${raw.id}:`;
      if (groupKey.startsWith(prefix)) keys.add(groupKey.slice(prefix.length));
    }
    // A malformed/failed raw item with no candidate cannot safely describe a
    // new offer, so it produces no reconciliation record.
    if (keys.size === 0) continue;

    for (const subOfferKey of keys) {
      const group = candidatesByRawAndKey.get(`${raw.id}:${subOfferKey}`) ?? [];
      const linkedApproved = group.find(
        (candidate) =>
          candidate.review_status === "approved" && Boolean(candidate.approved_offer_id),
      );
      // Retained raw/candidate lineage is intentionally longer-lived than a
      // public offer. Once the canonical row is archived it must not be
      // projected as either an expired offer or a brand-new offer forever.
      if (
        linkedApproved?.approved_offer_id &&
        eligibleCanonicalOfferIds &&
        !eligibleCanonicalOfferIds.has(linkedApproved.approved_offer_id)
      ) {
        continue;
      }
      const approved = linkedApproved;
      const handledRevision = group.find((candidate) =>
        atOrAfter(candidate.created_at, raw.updated_at),
      );
      // Candidate creation records the persisted raw revision that was
      // considered. Open, approved, rejected and archived terminal decisions
      // all suppress that same revision; only a later successful raw update
      // makes it eligible again. This avoids recreating rejected/archive work
      // and does not infer disappearance from a source that was not fetched.
      if (handledRevision) continue;

      const current = extractionByKey.get(subOfferKey) ?? null;
      if (!approved && !current) continue;
      const before = approved ? extractionFromCandidate(approved) : null;
      const explicitlyRemoved = current?.sourcePresence === "removed";
      const parseFailed =
        raw.processing_status === "rejected" ||
        Boolean(raw.parser_error) ||
        malformed ||
        (raw.processing_status === "parsed" && rawValues.length === 0);
      const item: ReconcileItem = {
        offerId: approved?.approved_offer_id ?? null,
        before,
        after: explicitlyRemoved ? null : current,
        canonicalExpiryDate: before?.expiresAt ?? null,
        canonicalOngoing: before?.isOngoing ?? false,
        withdrawalStated: explicitlyRemoved,
        parseFailed,
      };
      records.push({
        key: `${raw.id}:${subOfferKey}`,
        sourceId: raw.source_id,
        rawItemId: raw.id,
        subOfferKey,
        snapshotHash: raw.content_hash,
        rawUpdatedAt: raw.updated_at,
        item,
      });
    }
  }
  return records;
}

export interface StoredOfferReconcileLoadResult {
  available: boolean;
  records: StoredOfferReconcileRecord[];
}

/** Load only already-stored raw/candidate state; no source adapter is invoked. */
export async function loadStoredOfferReconcileRecords(): Promise<StoredOfferReconcileLoadResult> {
  const db = getSupabaseAdmin();
  // Intentional closure is not an error state. A source participates only when
  // both persisted outbound gates are open; disabled/admin-assisted sources
  // contribute no items and therefore can never be labelled unavailable.
  const sourceResult = await db
    .from("gift_card_sources")
    .select("id")
    .eq("enabled", true)
    .eq("automated_fetch_allowed", true)
    .not("terms_checked_at", "is", null)
    .not("robots_checked_at", "is", null)
    .limit(100);
  if (sourceResult.error) {
    if (isMissingGiftCardReconcileSchemaError(sourceResult.error)) {
      return { available: false, records: [] };
    }
    throw new Error(`load reconcile source gates failed: ${sourceResult.error.message}`);
  }
  const permittedSourceIds = ((sourceResult.data ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter(Boolean);
  if (permittedSourceIds.length === 0) {
    return { available: true, records: [] };
  }
  const rawResult = await db
    .from("gift_card_raw_items")
    .select(
      "id, source_id, content_hash, raw_payload, processing_status, parser_error, last_seen_at, updated_at",
    )
    .in("source_id", permittedSourceIds)
    .in("processing_status", ["parsed", "rejected"])
    .order("last_seen_at", { ascending: false })
    .limit(5000);
  if (rawResult.error) {
    if (isMissingGiftCardReconcileSchemaError(rawResult.error)) {
      return { available: false, records: [] };
    }
    throw new Error(`load reconcile raw items failed: ${rawResult.error.message}`);
  }
  const rawRows = (rawResult.data ?? []) as unknown as StoredReconcileRawRow[];
  if (rawRows.length === 0) return { available: true, records: [] };

  const candidateResult = await db
    .from("gift_card_offer_candidates")
    .select(
      "id, raw_item_id, source_id, seller_name, gift_card_brands, promotion_type, discount_percent, bonus_percent, points_multiplier, points_program, effective_discount_percent, starts_at, expires_at, terms_json, extraction_confidence, extraction_warnings, review_status, approved_offer_id, created_at",
    )
    .in("raw_item_id", rawRows.map((row) => row.id))
    .order("created_at", { ascending: false })
    .limit(10000);
  if (candidateResult.error) {
    if (isMissingGiftCardReconcileSchemaError(candidateResult.error)) {
      return { available: false, records: [] };
    }
    throw new Error(
      `load reconcile candidates failed: ${candidateResult.error.message}`,
    );
  }
  const candidateRows = (candidateResult.data ?? []) as unknown as StoredReconcileCandidateRow[];
  const linkedOfferIds = Array.from(new Set(
    candidateRows.flatMap((candidate) =>
      candidate.review_status === "approved" && candidate.approved_offer_id
        ? [candidate.approved_offer_id]
        : [],
    ),
  ));
  let eligibleCanonicalOfferIds = new Set<string>();
  if (linkedOfferIds.length > 0) {
    const canonicalResult = await db
      .from("gift_card_offers")
      .select("id, lifecycle_state")
      .in("id", linkedOfferIds)
      .in("lifecycle_state", ["active", "approved-future"])
      .limit(linkedOfferIds.length);
    if (canonicalResult.error) {
      if (isMissingGiftCardReconcileSchemaError(canonicalResult.error)) {
        throw new GiftCardLifecycleSchemaUnavailableError(
          "Gift-card reconciliation requires migration 032 lifecycle state.",
        );
      }
      throw new Error(
        `load reconcile canonical lifecycle failed: ${canonicalResult.error.message}`,
      );
    }
    eligibleCanonicalOfferIds = new Set(
      ((canonicalResult.data ?? []) as unknown as Array<{ id: string }>).map(
        (row) => row.id,
      ),
    );
  }
  return {
    available: true,
    records: buildStoredOfferReconcileRecords(
      rawRows,
      candidateRows,
      eligibleCanonicalOfferIds,
    ),
  };
}

function comparableOfferValue(row: {
  promotion_type: string;
  discount_percent: number | string | null;
  bonus_percent: number | string | null;
  points_multiplier: number | string | null;
}): string | null {
  if (row.promotion_type === "points" && numberOrNull(row.points_multiplier)) {
    return `${numberOrNull(row.points_multiplier)}x`;
  }
  const percent =
    row.promotion_type === "bonus-value"
      ? numberOrNull(row.bonus_percent)
      : numberOrNull(row.discount_percent);
  return percent == null ? null : `${percent}%`;
}

/** Confirmed public facts are read for prediction comparison only. */
export async function loadConfirmedOffersForPredictionReconcile(): Promise<ConfirmedOfferInput[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("gift_card_offers")
    .select(
      "id, brand, purchase_location, promotion_type, discount_percent, bonus_percent, points_multiplier, start_date, expiry_date, confidence, is_published",
    )
    .eq("confidence", "confirmed")
    .in("lifecycle_state" as never, ["active", "approved-future"] as never);
  if (error) {
    if (isMissingGiftCardReconcileSchemaError(error)) {
      throw new GiftCardLifecycleSchemaUnavailableError(
        "Prediction reconciliation requires migration 032 lifecycle state.",
      );
    }
    throw new Error(`load confirmed gift-card offers failed: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    brand: string;
    purchase_location: string | null;
    promotion_type: string;
    discount_percent: number | string | null;
    bonus_percent: number | string | null;
    points_multiplier: number | string | null;
    start_date: string | null;
    expiry_date: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    seller: row.purchase_location,
    families: row.brand.trim() ? [row.brand] : [],
    promotionType: row.promotion_type || null,
    value: comparableOfferValue(row),
    startDate: row.start_date,
    expiryDate: row.expiry_date,
  }));
}

export async function recordGiftCardReconcileAudit(event: {
  action: string;
  tableName?: string;
  rowId: string;
  diff: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from("audit_log").insert({
    actor_email: null,
    action: event.action,
    table_name: event.tableName ?? "gift_card_offer_candidates",
    row_id: event.rowId,
    diff: event.diff as never,
  });
  if (error) throw new Error(`gift-card reconcile audit failed: ${error.message}`);
}

function stagedExtraction(
  record: StoredOfferReconcileRecord,
  result: ReconcileResult,
): ExtractedOffer | null {
  const source = result.outcome === "new-offer" || result.outcome.startsWith("changed-") ||
      result.outcome === "material-change" || result.outcome === "date-extension" ||
      result.outcome === "date-reduction"
    ? record.item.after
    : record.item.before;
  if (!source) return null;
  if (result.outcome === "source-unavailable" || result.outcome === "withdrawn") {
    return {
      ...source,
      sourcePresence: "removed",
      warnings: [...source.warnings, result.detail ?? "Source presence needs review."],
    };
  }
  if (result.outcome === "expired") {
    return {
      ...source,
      sourceMarkedExpired: true,
      warnings: [...source.warnings, result.detail ?? "Expiry needs lifecycle review."],
    };
  }
  return source;
}

/**
 * Stage a private review candidate once for a stored snapshot. A retry first
 * checks for a candidate created from the same-or-newer raw revision. Public
 * `gift_card_offers` is never read-modify-written here.
 */
export async function stageStoredOfferReconcileResult(
  record: StoredOfferReconcileRecord,
  result: ReconcileResult,
  now: Date,
): Promise<"staged" | "already-staged" | "schema-missing"> {
  const extraction = stagedExtraction(record, result);
  if (!extraction) {
    throw new Error(`No stored extraction is available for ${record.key}.`);
  }
  const db = getSupabaseAdmin();
  const existing = await db
    .from("gift_card_offer_candidates")
    .select("id, created_at")
    .eq("raw_item_id", record.rawItemId)
    .in("review_status", OPEN_REVIEW_STATES)
    .contains("terms_json", { subOfferKey: record.subOfferKey } as never)
    .gte("created_at", record.rawUpdatedAt)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    if (isMissingGiftCardReconcileSchemaError(existing.error)) return "schema-missing";
    throw new Error(`check reconcile candidate failed: ${existing.error.message}`);
  }
  if (existing.data) return "already-staged";

  const changeKind =
    result.outcome === "source-unavailable" || result.outcome === "withdrawn"
      ? "source-removed"
      : result.outcome === "date-extension" || result.outcome === "date-reduction"
        ? "expiry-extension"
        : result.outcome === "new-offer"
          ? null
          : "material-offer";
  await stageCandidate(record.sourceId, {
    rawItemId: record.rawItemId,
    extraction,
    changeKind,
    changedFields: result.changedFields,
    fieldDiff: result.candidateDraft?.fieldDiff,
    reviewStatus: record.item.offerId ? "changed" : "new",
  });
  await recordGiftCardReconcileAudit({
    action: "gift-card-reconcile-stage",
    rowId: record.item.offerId ?? record.rawItemId,
    diff: {
      outcome: result.outcome,
      rawItemId: record.rawItemId,
      sourceId: record.sourceId,
      subOfferKey: record.subOfferKey,
      snapshotHash: record.snapshotHash,
      changedFields: result.changedFields,
      stagedAt: now.toISOString(),
      publicOfferMutated: false,
    },
  });
  return "staged";
}

/**
 * Non-material refresh is already persisted by the ingest transaction that
 * wrote/touched the raw item. Reconciliation verifies the snapshot has not
 * drifted before counting that refresh; it must not forge a newer last-seen
 * timestamp without a source fetch.
 */
export async function confirmStoredOfferRefresh(
  record: StoredOfferReconcileRecord,
): Promise<"confirmed" | "schema-missing"> {
  const { data, error } = await getSupabaseAdmin()
    .from("gift_card_raw_items")
    .select("id")
    .eq("id", record.rawItemId)
    .eq("content_hash", record.snapshotHash)
    .maybeSingle();
  if (error) {
    if (isMissingGiftCardReconcileSchemaError(error)) return "schema-missing";
    throw new Error(`confirm reconcile refresh failed: ${error.message}`);
  }
  if (!data) throw new Error(`Stored snapshot ${record.key} changed during reconcile.`);
  return "confirmed";
}
