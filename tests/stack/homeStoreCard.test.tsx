import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreCard from "@/components/StoreCard";
import type { Store } from "@/lib/data";
import type { StackRecommendation } from "@/lib/offers/types";

const store: Store = {
  id: "costco",
  name: "Costco",
  category: "Warehouse Club",
  logo: "CO",
  discountPercent: 0,
  discountCode: "Membership required",
  expiryDate: null,
  cashbackPercent: 0,
  cashbackProvider: "—",
  giftCardDiscountPercent: 0,
  giftCardSource: "No public discount",
  pointsProgram: "—",
  pointsRate: "No store program",
};

describe("homepage store card", () => {
  it("uses a truthful no-stack state instead of up to 0%", () => {
    const html = renderToStaticMarkup(<StoreCard store={store} variant="stack" />);
    expect(html).toContain("Watching for offers");
    expect(html).not.toContain("up to 0%");
  });

  it("labels points-only recommendations without claiming a cash discount", () => {
    const recommendation: StackRecommendation = {
      merchantId: store.id,
      merchantName: store.name,
      title: "Points at Costco",
      kind: "points-only",
      basePrice: 500,
      components: [{ layer: "points", label: "1 point per $1", pointsEarned: 500, optional: false, citation: { source: "manual", sourceUrl: "/" }, confidence: "confirmed" }],
      effectivePrice: 500,
      effectiveDiscountPercent: 0,
      totalSaving: 0,
      verifiedSaving: 0,
      checkedAsOf: "2026-07-12T00:00:00Z",
      soonestExpiry: null,
      pointsEarned: 500,
      pointsValueDollars: 2.5,
      confidence: "confirmed",
      warnings: [],
      citations: [],
      weekOf: "2026-07-06",
    };
    const html = renderToStaticMarkup(<StoreCard store={store} recommendation={recommendation} variant="stack" />);
    expect(html).toContain("Points only");
    expect(html).not.toContain("Up to 0%");
  });
});
