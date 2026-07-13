import { describe, expect, it } from "vitest";
import { searchGiftCardAcceptance } from "@/lib/giftcards/searchAcceptance";
import type { GiftCardAcceptanceRow, GiftCardProduct } from "@/lib/offers/types";

const products: GiftCardProduct[] = [
  {
    id: "ultimate",
    brand: "Ultimate Gift Card",
    slug: "ultimate-gift-card",
    issuer: "Blackhawk Network",
    cardNetwork: "visa",
    format: "digital-and-physical",
    variableLoad: true,
    minDenomination: 20,
    maxDenomination: 500,
    categoryRestricted: false,
    supportedMccs: [],
    unsupportedMccs: [],
    mobileWallet: "partial",
    redemptionNotes: null,
  },
];

const acceptance: GiftCardAcceptanceRow[] = [
  {
    id: "acceptance-jbhifi",
    productId: "ultimate",
    storeId: "jb-hi-fi",
    merchantName: "JB Hi-Fi",
    merchantCategory: "Electronics",
    mcc: 5732,
    status: "verified",
    outcome: "successful",
    sourceUrl: "https://example.test/evidence",
    checkedAt: "2026-07-12T00:00:00Z",
    notes: null,
  },
];

describe("bidirectional gift-card acceptance search", () => {
  it("finds the card from a merchant query and the merchant from a card query", () => {
    expect(searchGiftCardAcceptance(products, acceptance, "JB Hi-Fi")).toEqual([
      { product: products[0], row: acceptance[0] },
    ]);
    expect(searchGiftCardAcceptance(products, acceptance, "Ultimate")).toEqual([
      { product: products[0], row: acceptance[0] },
    ]);
  });

  it("never leaks acceptance attached to a non-public product", () => {
    expect(searchGiftCardAcceptance([], acceptance, "JB Hi-Fi")).toEqual([]);
  });
});
