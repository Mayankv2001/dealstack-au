import { describe, expect, it } from "vitest";
import { ACCEPTANCE_CHANGED_WARNING, acceptanceChangedSince, reconcileAcceptance } from "@/lib/giftcards/reconcileAcceptance";
import type { AcceptanceCandidateDraft } from "@/lib/giftcards/parseMerchantList";
import { makeGiftCardAcceptance } from "../stack/factories";

const candidate = (values: Partial<AcceptanceCandidateDraft> = {}): AcceptanceCandidateDraft => ({
  rawMerchantName: "Myer", sourceId: "source", proposedProductId: "product-1",
  resolvedStoreId: "myer", resolutionState: "resolved", changeKind: "changed",
  linkedAcceptanceId: "acceptance-1",
  proposedValues: { merchant_name: "Myer", accepts_online: true, accepts_in_store: true, limitations: null, evidence_source_type: "issuer-official" },
  ...values,
});

describe("acceptance reconciliation", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  it("emits additions and removals", () => {
    expect(reconcileAcceptance([], [candidate({ linkedAcceptanceId: null, changeKind: "new" })], now)[0].outcomes).toEqual(["merchant-added"]);
    expect(reconcileAcceptance([makeGiftCardAcceptance()], [candidate({ changeKind: "removed" })], now)[0].outcomes).toEqual(["merchant-removed"]);
  });
  it("detects rename, alias, channels, terms and MCC changes", () => {
    const result = reconcileAcceptance([makeGiftCardAcceptance({ acceptsOnline: false, acceptsInStore: false, limitations: "Old", mcc: 1 })], [candidate({ resolvedStoreId: "jb-hifi", proposedValues: { merchant_name: "JB Hi-Fi", accepts_online: true, accepts_in_store: true, limitations: "New", mcc: 5732, evidence_source_type: "issuer-official" } })], now)[0];
    expect(result.outcomes).toEqual(expect.arrayContaining(["merchant-renamed", "alias-changed", "online-changed", "in-store-changed", "terms-changed", "mcc-changed"]));
  });
  it("detects missing evidence, stale rows and official upgrades", () => {
    expect(reconcileAcceptance([makeGiftCardAcceptance()], [candidate({ proposedValues: {} })], now)[0].outcomes).toContain("evidence-source-missing");
    expect(reconcileAcceptance([makeGiftCardAcceptance({ evidenceSourceType: "community" })], [candidate()], now)[0].outcomes).toContain("official-supersedes-unofficial");
    expect(reconcileAcceptance([makeGiftCardAcceptance({ lastCheckedAt: "2026-01-01T00:00:00Z" })], [], now)[0].outcomes).toEqual(["became-stale"]);
  });
  it("is idempotent for unchanged input and exports saved-plan warning copy", () => {
    const row = makeGiftCardAcceptance();
    const unchanged = candidate({ proposedValues: { merchant_name: row.merchantName, accepts_online: row.acceptsOnline, accepts_in_store: row.acceptsInStore, limitations: row.limitations, evidence_source_type: row.evidenceSourceType } });
    expect(reconcileAcceptance([row], [unchanged], new Date("2026-06-15T00:00:00Z"))[0].outcomes).toEqual(["unchanged"]);
    expect(acceptanceChangedSince(row, "2026-06-01T00:00:00Z")).toBe(true);
    expect(ACCEPTANCE_CHANGED_WARNING).toBe("Merchant acceptance has changed since this plan was created.");
  });
});

