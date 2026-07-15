import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_EVIDENCE_RANK,
  acceptanceEvidenceLabel,
  acceptanceMccDisclaimer,
  deriveAcceptanceFreshness,
  isCurrentlyAccepted,
} from "@/lib/giftcards/acceptanceModel";
import {
  isReviewedPublicAcceptanceRow,
  mapGiftCardAcceptance,
} from "@/lib/repos/giftCardProducts";
import { makeGiftCardAcceptance } from "../stack/factories";

describe("gift-card acceptance evidence and freshness", () => {
  it("orders evidence tiers from official to community", () => {
    expect(ACCEPTANCE_EVIDENCE_RANK["issuer-official"]).toBeGreaterThan(
      ACCEPTANCE_EVIDENCE_RANK["merchant-official"],
    );
    expect(ACCEPTANCE_EVIDENCE_RANK.terms).toBeGreaterThan(
      ACCEPTANCE_EVIDENCE_RANK["card-network-mcc"],
    );
    expect(ACCEPTANCE_EVIDENCE_RANK.gcdb).toBeGreaterThan(
      ACCEPTANCE_EVIDENCE_RANK.specialist,
    );
    expect(ACCEPTANCE_EVIDENCE_RANK.specialist).toBeGreaterThan(
      ACCEPTANCE_EVIDENCE_RANK.community,
    );
  });

  it("uses the 21-day stack freshness boundary", () => {
    const row = makeGiftCardAcceptance({ lastCheckedAt: "2026-07-01T00:00:00Z" });
    expect(deriveAcceptanceFreshness(row, new Date("2026-07-22T00:00:00Z"))).toBe("current");
    expect(deriveAcceptanceFreshness(row, new Date("2026-07-22T00:00:01Z"))).toBe("stale");
  });

  it("uses the exact public attribution catalogue", () => {
    expect(acceptanceEvidenceLabel(makeGiftCardAcceptance({ evidencePublisher: "TCN" }))).toBe("Officially listed by TCN");
    expect(acceptanceEvidenceLabel(makeGiftCardAcceptance({ evidenceSourceType: "gcdb" }))).toBe("Listed by GCDB; issuer confirmation not found");
    expect(acceptanceEvidenceLabel(makeGiftCardAcceptance({ evidenceSourceType: "card-network-mcc", mcc: 5732 }))).toBe("Unofficial MCC-based acceptance");
    expect(acceptanceEvidenceLabel(makeGiftCardAcceptance({ evidenceSourceType: "community" }))).toBe("Acceptance requires verification");
  });

  it("always adds the stronger disclaimer to unofficial MCC evidence", () => {
    expect(acceptanceMccDisclaimer(makeGiftCardAcceptance({ evidenceSourceType: "card-network-mcc", mcc: 5732 }))).toContain("Unofficial MCC-based acceptance");
  });

  it("excludes stale, negative and out-of-validity rows from new plans", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    expect(isCurrentlyAccepted(makeGiftCardAcceptance({ lastCheckedAt: "2026-07-14T00:00:00Z" }), now)).toBe(true);
    expect(isCurrentlyAccepted(makeGiftCardAcceptance({ acceptanceStatus: "confirmed-not-accepted" }), now)).toBe(false);
    expect(isCurrentlyAccepted(makeGiftCardAcceptance({ validUntil: "2026-07-14" }), now)).toBe(false);
  });

  it("maps legacy rows into the canonical vocabulary before 028 is applied", () => {
    const base = {
      id: "legacy", product_id: "p", store_id: "s", merchant_name: "Store",
      merchant_category: null, mcc: null, source_url: null,
      checked_at: "2026-07-14T00:00:00Z", notes: null,
    };
    expect(mapGiftCardAcceptance({ ...base, status: "verified", outcome: "successful" }).acceptanceStatus).toBe("confirmed-accepted");
    expect(mapGiftCardAcceptance({ ...base, status: "claimed", outcome: null }).acceptanceStatus).toBe("likely-accepted");
    expect(mapGiftCardAcceptance({ ...base, status: "community", outcome: null }).acceptanceStatus).toBe("unofficially-reported");
    expect(mapGiftCardAcceptance({ ...base, status: "verified", outcome: "unsuccessful" }).acceptanceStatus).toBe("confirmed-not-accepted");
  });

  it("fails closed on post-028 rows that did not cross reviewed approval", () => {
    expect(isReviewedPublicAcceptanceRow({ review_state: "approved" } as never)).toBe(true);
    expect(isReviewedPublicAcceptanceRow({ review_state: null } as never)).toBe(false);
    expect(isReviewedPublicAcceptanceRow({ review_state: "pending" } as never)).toBe(false);
    // Pre-028 rows have no column at all and retain the legacy public boundary.
    expect(isReviewedPublicAcceptanceRow({} as never)).toBe(true);
  });
});
