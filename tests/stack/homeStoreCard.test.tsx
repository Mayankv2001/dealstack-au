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
    const html = renderToStaticMarkup(
      <StoreCard store={store} variant="stack" />,
    );
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
      components: [
        {
          layer: "points",
          label: "1 point per $1",
          pointsEarned: 500,
          optional: false,
          citation: { source: "manual", sourceUrl: "/" },
          confidence: "confirmed",
        },
      ],
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
    const html = renderToStaticMarkup(
      <StoreCard
        store={store}
        recommendation={recommendation}
        variant="stack"
      />,
    );
    expect(html).toContain("Points only");
    expect(html).not.toContain("Up to 0%");
  });

  it("shows a readable freshness state plus the supporting date", () => {
    const recommendation: StackRecommendation = {
      merchantId: store.id,
      merchantName: store.name,
      title: "Costco saving",
      kind: "cash",
      basePrice: 500,
      components: [
        {
          layer: "discount",
          label: "5% discount",
          valueDollars: 25,
          optional: false,
          citation: {
            source: "manual",
            sourceUrl: "https://www.costco.com.au",
          },
          confidence: "confirmed",
        },
      ],
      effectivePrice: 475,
      effectiveDiscountPercent: 5,
      totalSaving: 25,
      verifiedSaving: 25,
      checkedAsOf: "2026-07-10T00:00:00+10:00",
      soonestExpiry: "2026-07-20",
      pointsEarned: 0,
      pointsValueDollars: 0,
      confidence: "confirmed",
      warnings: [],
      citations: [],
      weekOf: "2026-07-06",
    };
    const html = renderToStaticMarkup(
      <StoreCard
        store={store}
        recommendation={recommendation}
        variant="stack"
        now={new Date("2026-07-14T12:00:00+10:00")}
      />,
    );
    expect(html).toContain("Checked this week · checked 10 Jul 2026");
  });
});
