import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SmartStackComparisonCard from "@/components/SmartStackComparisonCard";
import type { Store } from "@/lib/data";
import type { SmartStackComparison } from "@/lib/stack/smartStack";

const stores: Store[] = [
  {
    id: "retailer-a",
    name: "Retailer A",
    category: "Electronics",
    logo: "RA",
    discountPercent: 0,
    discountCode: "-",
    expiryDate: null,
    cashbackPercent: 0,
    cashbackProvider: "ShopBack",
    giftCardDiscountPercent: 0,
    giftCardSource: "",
    pointsProgram: "-",
    pointsRate: "",
  },
  {
    id: "retailer-b",
    name: "Retailer B",
    category: "Electronics",
    logo: "RB",
    discountPercent: 0,
    discountCode: "-",
    expiryDate: null,
    cashbackPercent: 0,
    cashbackProvider: "ShopBack",
    giftCardDiscountPercent: 0,
    giftCardSource: "",
    pointsProgram: "-",
    pointsRate: "",
  },
];

describe("SmartStackComparisonCard", () => {
  it("renders retailer links and never presents fallback spend as a product price", () => {
    const comparison: SmartStackComparison = {
      kind: "comparison",
      productGroup: "test-product",
      title: "Test product",
      options: [
        {
          signalPrice: 100,
          signal: {
            id: "priced",
            merchantId: "retailer-a",
            title: "Test product at A",
            summary: "",
            votesSample: 0,
            sentiment: "neutral",
            dealKind: "discount-code",
            sourceUrl: "https://www.ozbargain.com.au/node/900001",
            productUrl: "https://www.jbhifi.com.au/products/test-product",
            postedAt: null,
            confidence: "confirmed",
            lastCheckedAt: "2026-07-11T00:00:00Z",
            isSample: false,
            status: "approved",
          },
          recommendation: null,
        },
        {
          signalPrice: null,
          signal: {
            id: "unpriced",
            merchantId: "retailer-b",
            title: "Test product at B",
            summary: "",
            votesSample: 0,
            sentiment: "neutral",
            dealKind: "discount-code",
            sourceUrl: "https://www.ozbargain.com.au/node/900002",
            priceText: "Ask in store",
            postedAt: null,
            confidence: "needs-verification",
            lastCheckedAt: "2026-07-11T00:00:00Z",
            isSample: false,
            status: "approved",
          },
          recommendation: {
            merchantId: "retailer-b",
            merchantName: "Retailer B",
            kind: "cash",
            title: "Fallback estimate",
            basePrice: 500,
            components: [],
            effectivePrice: 450,
            payAtCheckout: 450,
            cashbackLater: 0,
            effectiveDiscountPercent: 10,
            totalSaving: 50,
            verifiedSaving: 0,
            checkedAsOf: null,
            soonestExpiry: null,
            pointsEarned: 0,
            pointsValueDollars: 0,
            confidence: "needs-verification",
            warnings: [],
            citations: [],
            weekOf: "2026-07-06",
          },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <SmartStackComparisonCard comparison={comparison} stores={stores} />,
    );
    expect(html).toContain("Compare 2 retailers");
    expect(html).toContain("$100.00");
    expect(html).toContain("Ask in store");
    expect(html).not.toContain("$450.00");
    expect(html).toContain(
      'href="https://www.jbhifi.com.au/products/test-product"',
    );
    expect(html).toContain("View at Retailer A");
    expect(html).toContain('href="https://www.ozbargain.com.au/node/900002"');
    expect(html).toContain("View deal source");
  });
});
