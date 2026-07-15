import type { GiftCardAcceptanceRow } from "@/lib/offers/types";
import {
  ACCEPTANCE_EVIDENCE_RANK,
  deriveAcceptanceFreshness,
} from "./acceptanceModel";
import type { AcceptanceCandidateDraft } from "./parseMerchantList";

export type AcceptanceReconciliationOutcome =
  | "merchant-added"
  | "merchant-removed"
  | "merchant-renamed"
  | "alias-changed"
  | "online-changed"
  | "in-store-changed"
  | "terms-changed"
  | "mcc-changed"
  | "evidence-source-missing"
  | "became-stale"
  | "official-supersedes-unofficial"
  | "unchanged";

export const ACCEPTANCE_CHANGED_WARNING =
  "Merchant acceptance has changed since this plan was created.";

export interface AcceptanceReconciliationResult {
  currentId: string | null;
  candidate: AcceptanceCandidateDraft | null;
  outcomes: AcceptanceReconciliationOutcome[];
}

const official = new Set(["issuer-official", "merchant-official", "terms"]);

export function reconcileAcceptance(
  current: GiftCardAcceptanceRow[],
  candidates: AcceptanceCandidateDraft[],
  now: Date,
): AcceptanceReconciliationResult[] {
  const results: AcceptanceReconciliationResult[] = [];
  const currentById = new Map(current.map((row) => [row.id, row]));
  const candidateByCurrent = new Map(
    candidates
      .filter((candidate) => candidate.linkedAcceptanceId)
      .map((candidate) => [candidate.linkedAcceptanceId!, candidate]),
  );

  for (const candidate of candidates) {
    const previous = candidate.linkedAcceptanceId
      ? currentById.get(candidate.linkedAcceptanceId) ?? null
      : null;
    if (!previous) {
      results.push({
        currentId: null,
        candidate,
        outcomes: ["merchant-added"],
      });
      continue;
    }
    if (candidate.changeKind === "removed") {
      results.push({
        currentId: previous.id,
        candidate,
        outcomes: ["merchant-removed"],
      });
      continue;
    }
    const proposed = candidate.proposedValues;
    const outcomes: AcceptanceReconciliationOutcome[] = [];
    if (
      typeof proposed.merchant_name === "string" &&
      proposed.merchant_name !== previous.merchantName
    ) outcomes.push("merchant-renamed");
    if (candidate.resolvedStoreId !== previous.storeId) outcomes.push("alias-changed");
    if (proposed.accepts_online !== previous.acceptsOnline) outcomes.push("online-changed");
    if (proposed.accepts_in_store !== previous.acceptsInStore) outcomes.push("in-store-changed");
    if (proposed.limitations !== previous.limitations) outcomes.push("terms-changed");
    if (proposed.mcc !== undefined && proposed.mcc !== previous.mcc) outcomes.push("mcc-changed");
    const nextEvidence =
      typeof proposed.evidence_source_type === "string"
        ? proposed.evidence_source_type
        : null;
    if (!nextEvidence) outcomes.push("evidence-source-missing");
    if (
      nextEvidence &&
      official.has(nextEvidence) &&
      previous.evidenceSourceType &&
      !official.has(previous.evidenceSourceType) &&
      ACCEPTANCE_EVIDENCE_RANK[
        nextEvidence as keyof typeof ACCEPTANCE_EVIDENCE_RANK
      ] > ACCEPTANCE_EVIDENCE_RANK[previous.evidenceSourceType]
    ) outcomes.push("official-supersedes-unofficial");
    results.push({
      currentId: previous.id,
      candidate,
      outcomes: outcomes.length ? outcomes : ["unchanged"],
    });
  }

  for (const row of current) {
    if (candidateByCurrent.has(row.id)) continue;
    if (deriveAcceptanceFreshness(row, now) === "stale") {
      results.push({
        currentId: row.id,
        candidate: null,
        outcomes: ["became-stale"],
      });
    }
  }
  return results;
}

export function acceptanceChangedSince(
  row: GiftCardAcceptanceRow,
  planCreatedAt: string,
): boolean {
  const checkedAt = row.lastCheckedAt ?? row.checkedAt;
  if (!checkedAt) return false;
  return Date.parse(checkedAt) > Date.parse(planCreatedAt);
}

