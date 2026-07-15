import type { AcceptanceCandidateDraft } from "@/lib/giftcards/parseMerchantList";
import type { GiftCardAcceptanceEvidenceType } from "@/lib/offers/types";
import type { GiftCardAcceptanceRow } from "@/lib/offers/types";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const CANDIDATE_TABLE = "gift_card_acceptance_candidates";

function candidateTable() {
  return getSupabaseAdmin().from(CANDIDATE_TABLE as never);
}

export interface AcceptanceCandidateRow {
  id: string;
  rawMerchantName: string;
  sourceId: string | null;
  rawItemId: string | null;
  proposedProductId: string | null;
  resolvedStoreId: string | null;
  proposedValues: Record<string, unknown>;
  resolutionState: "resolved" | "unresolved" | "ambiguous";
  changeKind: "new" | "changed" | "removed";
  reviewStatus: "new" | "changed" | "approved" | "rejected";
  reviewerEmail: string | null;
  reviewedAt: string | null;
  linkedAcceptanceId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CandidateDbRow {
  id: string;
  raw_merchant_name: string;
  source_id: string | null;
  raw_item_id: string | null;
  proposed_product_id: string | null;
  resolved_store_id: string | null;
  proposed_values: Record<string, unknown>;
  resolution_state: AcceptanceCandidateRow["resolutionState"];
  change_kind: AcceptanceCandidateRow["changeKind"];
  review_status: AcceptanceCandidateRow["reviewStatus"];
  reviewer_email: string | null;
  reviewed_at: string | null;
  linked_acceptance_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapCandidate(row: CandidateDbRow): AcceptanceCandidateRow {
  return {
    id: row.id,
    rawMerchantName: row.raw_merchant_name,
    sourceId: row.source_id,
    rawItemId: row.raw_item_id,
    proposedProductId: row.proposed_product_id,
    resolvedStoreId: row.resolved_store_id,
    proposedValues: row.proposed_values ?? {},
    resolutionState: row.resolution_state,
    changeKind: row.change_kind,
    reviewStatus: row.review_status,
    reviewerEmail: row.reviewer_email,
    reviewedAt: row.reviewed_at,
    linkedAcceptanceId: row.linked_acceptance_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function acceptanceCandidateToDraft(
  row: AcceptanceCandidateRow,
): AcceptanceCandidateDraft | null {
  if (!row.proposedProductId) return null;
  return {
    rawMerchantName: row.rawMerchantName,
    sourceId: row.sourceId,
    proposedProductId: row.proposedProductId,
    resolvedStoreId: row.resolvedStoreId,
    resolutionState: row.resolutionState,
    changeKind: row.changeKind,
    linkedAcceptanceId: row.linkedAcceptanceId,
    proposedValues: row.proposedValues,
  };
}

export async function listAcceptanceCandidates(
  statuses: AcceptanceCandidateRow["reviewStatus"][] = ["new", "changed"],
): Promise<AcceptanceCandidateRow[]> {
  const { data, error } = await candidateTable()
    .select("*" as never)
    .in("review_status" as never, statuses as never)
    .order("created_at" as never, { ascending: false })
    .limit(1000);
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) return [];
    throw new Error(`list acceptance candidates failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as CandidateDbRow[]).map(mapCandidate);
}

export async function getAcceptanceCandidate(
  id: string,
): Promise<AcceptanceCandidateRow | null> {
  const { data, error } = await candidateTable()
    .select("*" as never)
    .eq("id" as never, id as never)
    .maybeSingle();
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) return null;
    throw new Error(`get acceptance candidate failed: ${error.message}`);
  }
  return data ? mapCandidate(data as unknown as CandidateDbRow) : null;
}

export async function stageAcceptanceCandidates(
  drafts: AcceptanceCandidateDraft[],
): Promise<number> {
  if (drafts.length === 0) return 0;
  const rows = drafts.map((draft) => ({
    raw_merchant_name: draft.rawMerchantName,
    source_id: draft.sourceId,
    proposed_product_id: draft.proposedProductId,
    resolved_store_id: draft.resolvedStoreId,
    proposed_values: draft.proposedValues,
    resolution_state: draft.resolutionState,
    change_kind: draft.changeKind,
    review_status: draft.changeKind === "new" ? "new" : "changed",
    linked_acceptance_id: draft.linkedAcceptanceId,
  }));
  const { error } = await candidateTable().insert(rows as never);
  if (error) throw new Error(`stage acceptance candidates failed: ${error.message}`);
  return rows.length;
}

/** Stage one reviewable recheck the first time a published fact becomes stale. */
export async function stageStaleAcceptanceRecheck(
  row: GiftCardAcceptanceRow,
): Promise<boolean> {
  const existing = await candidateTable()
    .select("id" as never)
    .eq("linked_acceptance_id" as never, row.id as never)
    .in("review_status" as never, ["new", "changed"] as never)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`check stale acceptance candidate failed: ${existing.error.message}`);
  }
  if (existing.data) return false;
  await stageAcceptanceCandidates([
    {
      rawMerchantName:
        row.merchantName ?? row.merchantCategory ?? row.storeId ?? `MCC ${row.mcc ?? "unknown"}`,
      sourceId: null,
      proposedProductId: row.productId,
      resolvedStoreId: row.storeId,
      resolutionState: row.storeId ? "resolved" : "unresolved",
      changeKind: "changed",
      linkedAcceptanceId: row.id,
      proposedValues: {
        product_id: row.productId,
        store_id: row.storeId,
        merchant_name: row.merchantName,
        merchant_category: row.merchantCategory,
        mcc: row.mcc,
        acceptance_status: "requires-verification",
        evidence_source_type: row.evidenceSourceType,
        evidence_publisher: row.evidencePublisher,
        evidence_url: row.evidenceUrl ?? row.sourceUrl,
        evidence_captured_at: row.evidenceCapturedAt,
        last_checked_at: row.lastCheckedAt ?? row.checkedAt,
        accepts_online: row.acceptsOnline,
        accepts_in_store: row.acceptsInStore,
        accepts_app: row.acceptsApp,
        accepts_phone: row.acceptsPhone,
        limitations: row.limitations,
        region: row.region,
      },
    },
  ]);
  return true;
}

export async function updateAcceptanceCandidate(
  id: string,
  patch: {
    resolvedStoreId?: string | null;
    resolutionState?: AcceptanceCandidateRow["resolutionState"];
    proposedValues?: Record<string, unknown>;
    linkedAcceptanceId?: string | null;
    changeKind?: AcceptanceCandidateRow["changeKind"];
  },
): Promise<void> {
  const values = {
    ...(patch.resolvedStoreId !== undefined
      ? { resolved_store_id: patch.resolvedStoreId }
      : {}),
    ...(patch.resolutionState ? { resolution_state: patch.resolutionState } : {}),
    ...(patch.proposedValues ? { proposed_values: patch.proposedValues } : {}),
    ...(patch.linkedAcceptanceId !== undefined
      ? { linked_acceptance_id: patch.linkedAcceptanceId }
      : {}),
    ...(patch.changeKind ? { change_kind: patch.changeKind } : {}),
  };
  const { error } = await candidateTable()
    .update(values as never)
    .eq("id" as never, id as never)
    .in("review_status" as never, ["new", "changed"] as never);
  if (error) throw new Error(`update acceptance candidate failed: ${error.message}`);
}

export async function isAcceptanceCandidateSchemaAvailable(): Promise<boolean> {
  const { error } = await candidateTable().select("id" as never).limit(1);
  if (!error) return true;
  if (["42P01", "PGRST205"].includes(error.code ?? "")) return false;
  throw new Error(`check acceptance candidate schema failed: ${error.message}`);
}

export async function rejectAcceptanceCandidate(
  id: string,
  reviewer: string,
): Promise<void> {
  const { error } = await candidateTable()
    .update({
      review_status: "rejected",
      reviewer_email: reviewer,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, id as never)
    .in("review_status" as never, ["new", "changed"] as never);
  if (error) throw new Error(`reject acceptance candidate failed: ${error.message}`);
}

export function validateReviewedAcceptance(
  values: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const statuses = new Set([
    "confirmed-accepted",
    "confirmed-not-accepted",
    "likely-accepted",
    "unofficially-reported",
    "requires-verification",
    "stale",
    "unknown",
  ]);
  const tiers = new Set<GiftCardAcceptanceEvidenceType>([
    "issuer-official",
    "merchant-official",
    "terms",
    "card-network-mcc",
    "gcdb",
    "specialist",
    "community",
  ]);
  if (!String(values.product_id ?? "").trim()) errors.push("Product is required.");
  if (
    ![
      values.store_id,
      values.merchant_name,
      values.merchant_category,
      values.mcc,
    ].some((value) => String(value ?? "").trim())
  ) {
    errors.push("A store, merchant, category or MCC identity is required.");
  }
  if (!safeHttpsUrl(String(values.evidence_url ?? ""))) {
    errors.push("A safe HTTPS evidence URL is required.");
  }
  const evidenceType = String(values.evidence_source_type ?? "").trim();
  if (!evidenceType) {
    errors.push("An evidence tier is required.");
  } else if (!tiers.has(evidenceType as GiftCardAcceptanceEvidenceType)) {
    errors.push("Choose a valid evidence tier.");
  }
  if (Number.isNaN(Date.parse(String(values.evidence_captured_at ?? "")))) {
    errors.push("A valid evidence capture time is required.");
  }
  const status = String(values.acceptance_status ?? "").trim();
  if (!statuses.has(status)) errors.push("Choose a valid acceptance status.");
  return errors;
}

export async function approveAcceptanceCandidate(
  candidate: AcceptanceCandidateRow,
  reviewedValues: Record<string, unknown>,
  reviewer: string,
): Promise<string> {
  const errors = validateReviewedAcceptance(reviewedValues);
  if (errors.length) throw new Error(errors.join(" "));
  if (candidate.resolutionState !== "resolved") {
    throw new Error("Only a resolved acceptance candidate can be approved.");
  }
  if (candidate.changeKind === "removed") {
    const { data, error } = await getSupabaseAdmin().rpc(
      "approve_gift_card_acceptance_removal" as never,
      {
        p_candidate_id: candidate.id,
        p_reviewer: reviewer,
        p_final_status: reviewedValues.acceptance_status,
        p_valid_until: reviewedValues.valid_until,
      } as never,
    );
    if (error) throw new Error(`approve acceptance removal failed: ${error.message}`);
    return String(data);
  }
  const { data, error } = await getSupabaseAdmin().rpc(
    "approve_gift_card_acceptance_candidate" as never,
    {
      p_candidate_id: candidate.id,
      p_acceptance_id: candidate.linkedAcceptanceId,
      p_acceptance: reviewedValues,
      p_reviewer: reviewer,
    } as never,
  );
  if (error) throw new Error(`approve acceptance candidate failed: ${error.message}`);
  return String(data);
}

export async function getAcceptanceSourceEvidenceType(
  sourceId: string,
): Promise<GiftCardAcceptanceEvidenceType> {
  const { data, error } = await getSupabaseAdmin()
    .from("gift_card_sources")
    .select("acceptance_evidence_source_type" as never)
    .eq("id", sourceId)
    .single();
  if (error) throw new Error(`get acceptance source tier failed: ${error.message}`);
  const value = (data as unknown as { acceptance_evidence_source_type: string | null })
    .acceptance_evidence_source_type;
  if (!value) throw new Error("The source has no reviewed acceptance evidence tier.");
  return value as GiftCardAcceptanceEvidenceType;
}

export async function addStoreAlias(
  storeId: string,
  alias: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  const current = await db.from("stores").select("aliases").eq("id", storeId).single();
  if (current.error) throw new Error(`read store aliases failed: ${current.error.message}`);
  const aliases = [...new Set([...(current.data.aliases ?? []), alias.trim()])].filter(Boolean);
  const { error } = await db.from("stores").update({ aliases }).eq("id", storeId);
  if (error) throw new Error(`add store alias failed: ${error.message}`);
}
