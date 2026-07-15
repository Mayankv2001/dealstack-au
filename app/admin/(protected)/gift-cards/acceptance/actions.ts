"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  checkAdminRateLimit,
  type AdminActionResult,
} from "@/lib/admin/rate-limit";
import {
  addStoreAlias,
  approveAcceptanceCandidate,
  getAcceptanceCandidate,
  getAcceptanceSourceEvidenceType,
  rejectAcceptanceCandidate,
  stageAcceptanceCandidates,
  updateAcceptanceCandidate,
} from "@/lib/admin/repos/giftCardAcceptance";
import { logAudit } from "@/lib/admin/repos/audit";
import { listStores } from "@/lib/admin/repos/stores";
import {
  buildAcceptanceCandidateDrafts,
  parseMerchantList,
  type AcceptanceCandidateDraft,
} from "@/lib/giftcards/parseMerchantList";
import { getGiftCardAcceptance } from "@/lib/repos";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

export type AcceptanceActionState = { error?: string; success?: string };
const ACCEPTANCE_BULK_MAX = 200;

const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();

async function gate() {
  const { email } = await requireAdmin();
  const rate = await checkAdminRateLimit({
    adminEmail: email,
    actionKey: "gift_card_acceptance_review",
  });
  return { email, error: rate.success ? null : rate.error };
}

function refresh() {
  revalidatePath("/admin/gift-cards/acceptance");
  revalidatePath("/gift-cards/where-to-use");
  revalidatePath("/search");
}

export async function captureAcceptanceSnapshot(
  _state: AcceptanceActionState,
  form: FormData,
): Promise<AcceptanceActionState> {
  const access = await gate();
  if (access.error) return { error: access.error };
  const sourceId = text(form, "source_id");
  const productId = text(form, "product_id");
  const evidenceUrl = safeHttpsUrl(text(form, "evidence_url"));
  const capturedAt = text(form, "captured_at");
  const content = text(form, "content");
  if (!sourceId || !productId || !evidenceUrl || !content) {
    return {
      error: "Source, product, safe HTTPS evidence URL and captured content are required.",
    };
  }
  if (Number.isNaN(Date.parse(capturedAt))) {
    return { error: "A valid capture time is required." };
  }
  try {
    const [evidenceSourceType, stores, current] = await Promise.all([
      getAcceptanceSourceEvidenceType(sourceId),
      listStores(),
      getGiftCardAcceptance([productId]),
    ]);
    const snapshot = {
      content,
      contentType: text(form, "content_type") === "html" ? "html" as const : "text" as const,
      productId,
      sourceId,
      evidenceUrl,
      capturedAt: new Date(capturedAt).toISOString(),
      evidenceSourceType,
      completeSnapshot: form.get("complete_snapshot") === "on",
    };
    const entries = parseMerchantList(snapshot);
    if (entries.length === 0) return { error: "No merchant entries were found." };
    const drafts = buildAcceptanceCandidateDrafts(
      snapshot,
      entries,
      stores,
      current,
    );
    await stageAcceptanceCandidates(drafts);
    await logAudit({
      actorEmail: access.email,
      action: "capture-gift-card-acceptance-snapshot",
      tableName: "gift_card_acceptance_candidates",
      rowId: productId,
      diff: {
        sourceId,
        evidenceSourceType,
        entries: entries.length,
        candidates: drafts.length,
        completeSnapshot: snapshot.completeSnapshot,
      },
    });
    refresh();
    return { success: `${drafts.length} private candidates staged for review.` };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not capture the snapshot.",
    };
  }
}

export async function reviewAcceptanceCandidate(
  candidateId: string,
  _state: AcceptanceActionState,
  form: FormData,
): Promise<AcceptanceActionState> {
  const access = await gate();
  if (access.error) return { error: access.error };
  const candidate = await getAcceptanceCandidate(candidateId);
  if (!candidate) return { error: "Acceptance candidate was not found." };
  const intent = text(form, "intent") || "approve";
  try {
    if (intent === "reject") {
      await rejectAcceptanceCandidate(candidateId, access.email);
    } else if (intent === "save-match" || intent === "create-alias") {
      const storeId = text(form, "store_id");
      if (!storeId) return { error: "Choose a canonical store first." };
      if (intent === "create-alias") {
        await addStoreAlias(storeId, candidate.rawMerchantName);
      }
      await updateAcceptanceCandidate(candidateId, {
        resolvedStoreId: storeId,
        resolutionState: "resolved",
        proposedValues: { ...candidate.proposedValues, store_id: storeId },
      });
    } else if (intent === "mark-unofficial") {
      await updateAcceptanceCandidate(candidateId, {
        proposedValues: {
          ...candidate.proposedValues,
          acceptance_status: "unofficially-reported",
        },
      });
    } else if (intent === "mark-removed") {
      if (!candidate.linkedAcceptanceId) {
        return { error: "A no-longer-accepted candidate must link the prior relationship." };
      }
      await updateAcceptanceCandidate(candidateId, {
        changeKind: "removed",
        proposedValues: {
          ...candidate.proposedValues,
          acceptance_status: "confirmed-not-accepted",
          valid_until: text(form, "valid_until") || new Date().toISOString().slice(0, 10),
        },
      });
    } else if (intent === "merge-duplicate") {
      const acceptanceId = text(form, "linked_acceptance_id");
      if (!acceptanceId) return { error: "Enter the existing acceptance id." };
      await updateAcceptanceCandidate(candidateId, {
        linkedAcceptanceId: acceptanceId,
        changeKind: "changed",
      });
    } else if (intent === "request-recheck") {
      await updateAcceptanceCandidate(candidateId, {
        proposedValues: {
          ...candidate.proposedValues,
          acceptance_status: "requires-verification",
        },
      });
    } else if (intent === "split") {
      const names = text(form, "split_names")
        .split(/[\n,]/)
        .map((name) => name.trim())
        .filter(Boolean);
      if (names.length < 2) return { error: "Enter at least two merchant names to split." };
      const drafts: AcceptanceCandidateDraft[] = names.map((name) => ({
        rawMerchantName: name,
        sourceId: candidate.sourceId,
        proposedProductId: candidate.proposedProductId ?? "",
        resolvedStoreId: null,
        resolutionState: "unresolved",
        changeKind: "new",
        linkedAcceptanceId: null,
        proposedValues: {
          ...candidate.proposedValues,
          store_id: null,
          merchant_name: name,
        },
      }));
      if (drafts.some((draft) => !draft.proposedProductId)) {
        return { error: "The original candidate has no product to split." };
      }
      await stageAcceptanceCandidates(drafts);
      await rejectAcceptanceCandidate(candidateId, access.email);
    } else {
      const values = {
        ...candidate.proposedValues,
        product_id: candidate.proposedProductId,
        store_id: candidate.resolvedStoreId,
        merchant_name: text(form, "merchant_name") || candidate.rawMerchantName,
        acceptance_status:
          text(form, "acceptance_status") ||
          candidate.proposedValues.acceptance_status,
        valid_until: text(form, "valid_until") || null,
        is_public: true,
      };
      await approveAcceptanceCandidate(candidate, values, access.email);
    }
    await logAudit({
      actorEmail: access.email,
      action: `gift-card-acceptance-${intent}`,
      tableName: "gift_card_acceptance_candidates",
      rowId: candidateId,
      diff: { storeId: text(form, "store_id") || candidate.resolvedStoreId },
    });
    refresh();
    return { success: "Acceptance review action completed." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Review action failed." };
  }
}

export async function bulkApproveAcceptanceCandidates(
  ids: string[],
): Promise<AdminActionResult> {
  const access = await gate();
  if (access.error) return { error: access.error };
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > ACCEPTANCE_BULK_MAX) {
    return { error: `Select between 1 and ${ACCEPTANCE_BULK_MAX} candidates.` };
  }
  try {
    for (const id of unique) {
      const candidate = await getAcceptanceCandidate(id);
      if (!candidate) throw new Error(`Candidate ${id} was not found.`);
      await approveAcceptanceCandidate(
        candidate,
        {
          ...candidate.proposedValues,
          product_id: candidate.proposedProductId,
          store_id: candidate.resolvedStoreId,
          is_public: true,
        },
        access.email,
      );
    }
    await logAudit({
      actorEmail: access.email,
      action: "bulk-approve-gift-card-acceptance",
      tableName: "gift_card_acceptance_candidates",
      diff: { count: unique.length, ids: unique },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Bulk approval failed." };
  }
}
