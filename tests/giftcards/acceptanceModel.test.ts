import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_STATUS_LABEL,
  buildProductAcceptance,
  MCC_DISCLAIMER,
} from "@/lib/giftcards/acceptanceModel";
import type {
  GiftCardAcceptanceRow,
  GiftCardProduct,
} from "@/lib/offers/types";
import { makeBareOffer, makeOffer } from "./offerFixture";

const product = (overrides: Partial<GiftCardProduct> = {}): GiftCardProduct => ({
  id: "tcn-shop",
  brand: "TCN Shop",
  slug: "tcn-shop",
  issuer: "The Card Network",
  cardNetwork: "closed-loop",
  format: "digital-and-physical",
  variableLoad: true,
  minDenomination: 20,
  maxDenomination: 500,
  categoryRestricted: true,
  supportedMccs: [5732, 5651],
  unsupportedMccs: [5411],
  mobileWallet: "partial",
  redemptionNotes: null,
  aliases: [],
  officialProductPage: null,
  activationMethod: null,
  onlineAvailable: null,
  inStoreAvailable: null,
  denominations: null,
  activationDelayNote: null,
  splitPayment: "unknown",
  expiryOrFeesNote: null,
    purchaseFees: null,
  ...overrides,
});

const row = (
  overrides: Partial<GiftCardAcceptanceRow> = {}
): GiftCardAcceptanceRow => ({
  id: `acc-${Math.random().toString(36).slice(2, 8)}`,
  productId: "tcn-shop",
  storeId: null,
  merchantName: "JB Hi-Fi",
  merchantCategory: "Electronics",
  mcc: 5732,
  status: "verified",
  outcome: "successful",
  sourceUrl: null,
  checkedAt: "2026-07-10T00:00:00Z",
  notes: null,
  acceptanceStatus: "confirmed-accepted",
  evidenceSourceType: "issuer-official",
  evidencePublisher: "The Card Network",
  evidenceUrl: "https://example.test/evidence",
  evidenceCapturedAt: "2026-07-10T00:00:00Z",
  lastCheckedAt: "2026-07-10T00:00:00Z",
  acceptsOnline: true,
  acceptsInStore: true,
  acceptsApp: null,
  acceptsPhone: null,
  validFrom: null,
  validUntil: null,
  limitations: null,
  region: "AU",
  participatingLocationRequired: null,
  ...overrides,
});

describe("buildProductAcceptance", () => {
  it("builds one view per included product, preserving multi-card promos", () => {
    const views = buildProductAcceptance(makeOffer(), [product()], []);
    expect(views.map((v) => v.productId)).toEqual([
      "tcn-shop",
      "tcn-love",
      "tcn-good-food",
      "tcn-cinema",
    ]);
    expect(views[0].title).toBe("TCN Shop");
    // Products without an activated record still get an honest placeholder view.
    expect(views[1].product).toBeNull();
    expect(views[1].title).toBe("TCN");
  });

  it("splits accepted and known-not-working merchants", () => {
    const views = buildProductAcceptance(
      makeOffer(),
      [product()],
      [
        row({ merchantName: "JB Hi-Fi" }),
        row({ merchantName: "Coles", outcome: "unsuccessful", mcc: 5411 }),
        row({ merchantName: "Myer", status: "claimed", outcome: null }),
      ]
    );
    expect(views[0].merchants.map((m) => m.merchantName)).toEqual([
      "JB Hi-Fi",
      "Myer",
    ]);
    expect(views[0].rejectedMerchants.map((m) => m.merchantName)).toEqual(["Coles"]);
    expect(views[0].historicalMerchants).toEqual([]);
  });

  it("keeps a closed relationship off the current detail view", () => {
    const views = buildProductAcceptance(makeOffer(), [product()], [
      row({
        merchantName: "Former merchant",
        outcome: "unsuccessful",
        acceptanceStatus: "confirmed-not-accepted",
        validUntil: "2026-07-01",
      }),
    ]);
    expect(views[0].rejectedMerchants).toEqual([]);
    expect(views[0].historicalMerchants).toHaveLength(1);
  });

  it("exposes supported AND unsupported MCCs from the product record", () => {
    const views = buildProductAcceptance(makeOffer(), [product()], []);
    expect(views[0].supportedMccs).toEqual([5732, 5651]);
    expect(views[0].unsupportedMccs).toEqual([5411]);
  });

  it("leaves MCC lists empty (not invented) when no product record exists", () => {
    const views = buildProductAcceptance(makeOffer(), [], []);
    expect(views[0].supportedMccs).toEqual([]);
    expect(views[0].unsupportedMccs).toEqual([]);
  });

  it("derives categories and freshest check time from the evidence", () => {
    const views = buildProductAcceptance(
      makeOffer(),
      [product()],
      [
        row({ merchantCategory: "Electronics", checkedAt: "2026-07-01T00:00:00Z", lastCheckedAt: "2026-07-01T00:00:00Z" }),
        row({ merchantName: "Myer", merchantCategory: "Department stores", checkedAt: "2026-07-11T00:00:00Z", lastCheckedAt: "2026-07-11T00:00:00Z" }),
      ]
    );
    expect(views[0].categories).toEqual(["Department stores", "Electronics"]);
    expect(views[0].lastCheckedAt).toBe("2026-07-11T00:00:00Z");
  });

  it("yields no views when the offer has no product links", () => {
    expect(buildProductAcceptance(makeBareOffer(), [], [])).toEqual([]);
  });
});

describe("acceptance wording", () => {
  it("never implies guaranteed acceptance", () => {
    expect(MCC_DISCLAIMER).toBe(
      "Acceptance depends on the merchant category code assigned to the transaction. Verify before purchase."
    );
  });

  it("labels every confidence tier distinctly", () => {
    expect(ACCEPTANCE_STATUS_LABEL.verified).toBe("Verified");
    expect(ACCEPTANCE_STATUS_LABEL.claimed).toBe("Claimed by issuer");
    expect(ACCEPTANCE_STATUS_LABEL.community).toBe("Community-reported");
  });
});
