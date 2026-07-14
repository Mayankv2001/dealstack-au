import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RetailerGiftCardPlans from "@/components/RetailerGiftCardPlans";
import type { RetailerGiftCardPlan } from "@/lib/decision/types";
import { makeGiftCard } from "../stack/factories";

describe("retailer gift-card payment options", () => {
  it("shows a retailer-specific points option without reducing the cash price", () => {
    const plans: RetailerGiftCardPlan[] = [
      {
        merchantId: "jb-hifi",
        merchantName: "JB Hi-Fi",
        productTitle: "Apple MacBook Air M3",
        listedPrice: 1800,
        giftCardOptions: [
          {
            offer: makeGiftCard({
              id: "gc-ultimate-points",
              brand: "Ultimate",
              purchaseLocation: "Woolworths",
              acceptedAtMerchantIds: ["jb-hifi"],
              discountPercent: 0,
              promotionType: "points",
              pointsMultiplier: 20,
              pointsProgram: "Everyday Rewards",
            }),
            role: "included",
            compatibilityStatus: "likely-compatible",
            compatibilityReason: "Compatible at JB Hi-Fi, with current terms to check.",
            engineNote: "Estimated points value only; the cash price is unchanged.",
            warnings: ["Points are not cash."],
            coveredGiftCardValue: 1800,
            cashPaid: 1800,
            immediateCashSaving: 0,
            bonusCardValue: null,
            pointsEarned: 36_000,
            estimatedRewardsValue: 180,
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(
      <RetailerGiftCardPlans plans={plans} spend={1800} />,
    );
    expect(html).toContain("Gift-card ways to pay by retailer");
    expect(html).toContain("JB Hi-Fi");
    expect(html).toContain("Ultimate");
    expect(html).toContain("20x Everyday Rewards points");
    expect(html).toContain("use at JB Hi-Fi");
    expect(html).toContain("36,000 points");
    expect(html).toContain("about $180.00 rewards value");
    expect(html).toContain("Included in best plan");
    expect(html).toContain("cash price is unchanged");
    expect(html).not.toContain("$1,620");
  });

  it("states when no retailer-specific acceptance evidence exists", () => {
    const html = renderToStaticMarkup(
      <RetailerGiftCardPlans
        spend={500}
        plans={[
          {
            merchantId: "costco",
            merchantName: "Costco",
            productTitle: "Apple MacBook Air M3",
            listedPrice: 1750,
            giftCardOptions: [],
          },
        ]}
      />,
    );
    expect(html).toContain("No approved gift-card payment option recorded");
    expect(html).toContain("will not assume a card works here");
  });
});
