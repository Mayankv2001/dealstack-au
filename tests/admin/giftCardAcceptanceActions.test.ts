import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRate: vi.fn(),
  getCandidate: vi.fn(),
  getSourceTier: vi.fn(),
  reject: vi.fn(),
  stage: vi.fn(),
  update: vi.fn(),
  approve: vi.fn(),
  addAlias: vi.fn(),
  logAudit: vi.fn(),
  listStores: vi.fn(),
  getAcceptance: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({ checkAdminRateLimit: mocks.checkRate }));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/admin/repos/stores", () => ({ listStores: mocks.listStores }));
vi.mock("@/lib/repos", () => ({ getGiftCardAcceptance: mocks.getAcceptance }));
vi.mock("@/lib/admin/repos/giftCardAcceptance", () => ({
  addStoreAlias: mocks.addAlias,
  approveAcceptanceCandidate: mocks.approve,
  getAcceptanceCandidate: mocks.getCandidate,
  getAcceptanceSourceEvidenceType: mocks.getSourceTier,
  rejectAcceptanceCandidate: mocks.reject,
  stageAcceptanceCandidates: mocks.stage,
  updateAcceptanceCandidate: mocks.update,
}));

import {
  bulkApproveAcceptanceCandidates,
  captureAcceptanceSnapshot,
  reviewAcceptanceCandidate,
} from "@/app/admin/(protected)/gift-cards/acceptance/actions";

const candidate = {
  id: "candidate-1",
  rawMerchantName: "Nike Australia",
  sourceId: "source",
  rawItemId: null,
  proposedProductId: "tcn-shop",
  resolvedStoreId: null,
  proposedValues: {
    evidence_url: "https://example.test/evidence",
    evidence_source_type: "gcdb",
    evidence_captured_at: "2026-07-15T00:00:00Z",
  },
  resolutionState: "unresolved" as const,
  changeKind: "new" as const,
  reviewStatus: "new" as const,
  reviewerEmail: null,
  reviewedAt: null,
  linkedAcceptanceId: null,
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@example.test" });
  mocks.checkRate.mockResolvedValue({ success: true });
  mocks.getCandidate.mockResolvedValue(candidate);
  mocks.addAlias.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue(undefined);
  mocks.logAudit.mockResolvedValue(undefined);
});

describe("gift-card acceptance admin actions", () => {
  it("rate-limits capture before any source or staging read", async () => {
    mocks.checkRate.mockResolvedValue({ success: false, error: "Slow down" });
    const result = await captureAcceptanceSnapshot({}, new FormData());
    expect(result).toEqual({ error: "Slow down" });
    expect(mocks.getSourceTier).not.toHaveBeenCalled();
    expect(mocks.stage).not.toHaveBeenCalled();
  });

  it("caps a bulk review at 200 using one rate-limit unit", async () => {
    const result = await bulkApproveAcceptanceCandidates(
      Array.from({ length: 201 }, (_, index) => `candidate-${index}`),
    );
    expect(result).toEqual({ error: "Select between 1 and 200 candidates." });
    expect(mocks.checkRate).toHaveBeenCalledOnce();
    expect(mocks.getCandidate).not.toHaveBeenCalled();
  });

  it("creates a reviewed alias, corrects the candidate and audits both intent and row", async () => {
    const form = new FormData();
    form.set("intent", "create-alias");
    form.set("store_id", "nike");
    const result = await reviewAcceptanceCandidate("candidate-1", {}, form);
    expect(result).toEqual({ success: "Acceptance review action completed." });
    expect(mocks.addAlias).toHaveBeenCalledWith("nike", "Nike Australia");
    expect(mocks.update).toHaveBeenCalledWith("candidate-1", expect.objectContaining({ resolvedStoreId: "nike", resolutionState: "resolved" }));
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "gift-card-acceptance-create-alias", rowId: "candidate-1" }));
  });

  it("marks a candidate unofficial without rewriting its source provenance", async () => {
    const form = new FormData();
    form.set("intent", "mark-unofficial");
    expect(await reviewAcceptanceCandidate("candidate-1", {}, form)).toEqual({
      success: "Acceptance review action completed.",
    });
    expect(mocks.update).toHaveBeenCalledWith("candidate-1", {
      proposedValues: {
        ...candidate.proposedValues,
        acceptance_status: "unofficially-reported",
      },
    });
  });
});
