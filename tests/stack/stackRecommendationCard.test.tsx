import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import type { Store } from "@/lib/data";
import type { StackRecommendation } from "@/lib/offers/types";

const stores: Store[] = [
  {
    id: "myer",
    name: "Myer",
    category: "Department Store",
    logo: "MYER",
    discountPercent: 10,
    discountCode: "MYER10",
    expiryDate: null,
    cashbackPercent: 6,
    cashbackProvider: "ShopBack",
    giftCardDiscountPercent: 0,
    giftCardSource: "",
    pointsProgram: "MYER one",
    pointsRate: "2 / $1",
  },
  {
    id: "coles",
    name: "Coles",
    category: "Supermarket",
    logo: "Coles",
    discountPercent: 0,
    discountCode: "-",
    expiryDate: null,
    cashbackPercent: 0,
    cashbackProvider: "—",
    giftCardDiscountPercent: 0,
    giftCardSource: "",
    pointsProgram: "Flybuys",
    pointsRate: "1 / $1",
  },
];

function cashRec(over: Partial<StackRecommendation> = {}): StackRecommendation {
  return {
    merchantId: "myer",
    merchantName: "Myer",
    kind: "cash",
    title: "10% off code + 6% ShopBack cashback at Myer",
    basePrice: 500,
    components: [
      {
        layer: "discount",
        label: "10% off with MYER10",
        valuePercent: 10,
        valueDollars: 50,
        code: "MYER10",
        optional: false,
        citation: { source: "manual", sourceUrl: "/" },
        confidence: "needs-verification",
        note: "Use code MYER10 at checkout. Exclusions may apply.",
      },
      {
        layer: "cashback",
        label: "6% ShopBack cashback",
        valuePercent: 6,
        valueDollars: 27,
        optional: false,
        citation: {
          source: "manual",
          sourceUrl: "https://www.shopback.com.au",
        },
        confidence: "confirmed",
        note: "Track your purchase through ShopBack to earn up to 6% cashback.",
      },
    ],
    effectivePrice: 423,
    payAtCheckout: 450,
    cashbackLater: 27,
    effectiveDiscountPercent: 15.4,
    totalSaving: 77,
    verifiedSaving: 27,
    checkedAsOf: "2026-06-12T00:00:00+10:00",
    soonestExpiry: null,
    pointsEarned: 0,
    pointsValueDollars: 0,
    confidence: "needs-verification",
    warnings: [],
    citations: [
      { source: "manual", sourceUrl: "/" },
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
      {
        source: "ozbargain",
        sourceUrl: "https://www.ozbargain.com.au/node/900001",
      },
      {
        source: "ozbargain",
        sourceUrl: "https://www.ozbargain.com.au/node/900002",
      },
      {
        source: "ozbargain",
        sourceUrl: "https://www.ozbargain.com.au/node/900003",
      },
      {
        source: "ozbargain",
        sourceUrl: "https://www.ozbargain.com.au/node/900004",
      },
    ],
    weekOf: "2026-06-15",
    ...over,
  };
}

function pointsRec(): StackRecommendation {
  return {
    merchantId: "coles",
    merchantName: "Coles",
    kind: "points-only",
    title: "1 point per $1 on Flybuys at Coles",
    basePrice: 500,
    components: [
      {
        layer: "points",
        label: "1 point per $1 on Flybuys",
        pointsEarned: 500,
        valueDollars: 2.5,
        optional: false,
        citation: {
          source: "freepoints",
          sourceUrl: "https://www.freepoints.com.au",
        },
        confidence: "confirmed",
        note: "Points value is indicative and is not subtracted from the cash price.",
      },
    ],
    effectivePrice: 500,
    payAtCheckout: 500,
    cashbackLater: 0,
    effectiveDiscountPercent: 0,
    totalSaving: 0,
    verifiedSaving: 0,
    checkedAsOf: "2026-06-12T00:00:00+10:00",
    soonestExpiry: null,
    pointsEarned: 500,
    pointsValueDollars: 2.5,
    confidence: "confirmed",
    warnings: [],
    citations: [
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ],
    weekOf: "2026-06-15",
  };
}

const occurrences = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

describe("StackRecommendationCard — cash stack", () => {
  it("collapses duplicate OzBargain citations to one visible source with an accurate count", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={cashRec()} stores={stores} />,
    );
    // Four OzBargain records collapse into a single badge that carries the count.
    expect(html).toContain("OzBargain ×4");
    // The internal DealStack record is shown neutrally, not counted as a link
    // or independent publisher family.
    expect(html).toContain(
      "5 source links across 2 independent publisher families",
    );
    expect(html).toContain("DealStack record");
    expect(html).not.toContain("DealStack verified");
  });

  it("keeps every citation reachable in the disclosure", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={cashRec()} stores={stores} />,
    );
    // Full traceability: the individual node URLs remain in the expandable list.
    expect(html).toContain("https://www.ozbargain.com.au/node/900004");
    expect(html).toContain("<details");
  });

  it("shows the stack-level trust status exactly once", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={cashRec()} stores={stores} />,
    );
    expect(occurrences(html, "1 layer needs verification")).toBe(1);
  });

  it("leads with the outcome and renders no raw ISO dates or sample wording", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={cashRec()} stores={stores} />,
    );
    expect(html).toContain("You save $27.00");
    expect(html).toContain("Up to $77.00 including unverified layers");
    expect(html).toContain("on a $500.00 spend");
    expect(html).not.toMatch(/example (spend|purchase)/i);
    // Checkout price leads; later cashback and the effective net stay separate.
    expect(html).toContain("Pay at checkout");
    expect(html).toContain("$450.00");
    expect(html).toContain("+ $27.00 cashback later");
    expect(html).toContain("$423.00");
    expect(html).toContain("15.4% total saving");
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(html).not.toMatch(/sample/i);
  });

  it("offers an accessible copy-code action", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={cashRec()} stores={stores} />,
    );
    expect(html).toContain('aria-label="Copy code MYER10"');
  });

  it("labels a mutually exclusive layer as choose-one", () => {
    const rec = cashRec({
      components: [
        {
          layer: "gift-card",
          label: "5% off gift cards",
          valuePercent: 5,
          valueDollars: 25,
          optional: false,
          citation: { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
          confidence: "confirmed",
        },
        {
          layer: "cashback",
          label: "6% ShopBack cashback",
          valuePercent: 6,
          valueDollars: 27,
          optional: true,
          citation: {
            source: "manual",
            sourceUrl: "https://www.shopback.com.au",
          },
          confidence: "confirmed",
          note: "Use instead of the gift card, not together.",
        },
      ],
    });
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={rec} stores={stores} />,
    );
    expect(html).toContain("Choose one");
    expect(html).toContain("Available but not included");
    expect(html).toContain(
      "Not included — Use instead of the gift card, not together.",
    );
  });

  it("explains uncertain gift-card acquisition and redemption separately", () => {
    const rec = cashRec({
      components: [
        {
          layer: "gift-card",
          label: "5% off gift cards",
          valuePercent: 5,
          valueDollars: 25,
          optional: true,
          citation: { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
          confidence: "confirmed",
          compatibilityStatus: "requires-verification",
          compatibilityReason: "Acceptance needs checking.",
          compatibilityWarnings: ["Confirm retailer acceptance."],
          compatibilityStages: {
            acquisition: {
              status: "compatible",
              reason: "Purchase terms are confirmed.",
            },
            redemption: {
              status: "requires-verification",
              reason: "Acceptance is listed but not independently verified.",
            },
          },
        },
      ],
    });
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={rec} stores={stores} />,
    );
    expect(html).toContain("Why this needs checking");
    expect(html).toContain("Buy:");
    expect(html).toContain("Purchase terms are confirmed.");
    expect(html).toContain("Spend:");
    expect(html).toContain(
      "Acceptance is listed but not independently verified.",
    );
  });
});

describe("StackRecommendationCard — points-only", () => {
  it("presents earned points without a 0%-off headline", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={pointsRec()} stores={stores} />,
    );
    expect(html).toContain("Cash price remains");
    expect(html).toContain("$500.00");
    expect(html).toContain("Earn approximately 500 points");
    expect(html).toContain("not deducted from the cash price");
    expect(html).not.toContain("0% off");
    expect(html).not.toContain("% total saving");
  });
});

describe("StackRecommendationCard — trust, conditions and freshness", () => {
  it("labels each layer with its own honest verification chip", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={cashRec()} stores={stores} />,
    );
    expect(html).toContain(">Unverified<"); // discount layer
    expect(html).toContain(">Verified<"); // confirmed cashback layer
  });

  it("renders the descriptive layer-derived title", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={cashRec()} stores={stores} />,
    );
    expect(html).toContain("10% off code + 6% ShopBack cashback at Myer");
  });

  it("shows one freshness row with the oldest layer check", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard
        recommendation={cashRec()}
        stores={stores}
        now={new Date("2026-06-15T00:00:00+10:00")}
      />,
    );
    expect(html).toContain("Checked this week · checked 12 Jun 2026");
    expect(html).toContain("Date unknown");
  });

  it("collapses multiple warnings into one lead condition plus a disclosure", () => {
    const rec = cashRec({
      warnings: [
        {
          level: "info",
          code: "gift-card-excluded-from-cashback",
          message: "Cashback usually excludes gift-card payment.",
        },
        {
          level: "caution",
          code: "needs-verification",
          message: "The MYER10 code is unverified — confirm before using it.",
        },
        {
          level: "caution",
          code: "expiry-soon",
          message: "The gift card offer ends within 7 days.",
        },
      ],
    });
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={rec} stores={stores} />,
    );
    // Most severe condition leads; the rest sit behind one disclosure.
    expect(html).toContain("The MYER10 code is unverified");
    expect(html).toContain("View 2 more conditions");
    expect(
      occurrences(html, "rounded-md border px-2 py-1"),
    ).toBeLessThanOrEqual(1);
  });

  it("offers Build this stack and store actions", () => {
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={cashRec()} stores={stores} />,
    );
    expect(html).toContain("Build this stack");
    expect(html).toContain("/?stack=myer#calculator");
    expect(html).toContain("/stores/myer");
  });

  it("shows a fully verified headline only when every cash layer is confirmed", () => {
    const rec = cashRec({
      verifiedSaving: 77,
      components: cashRec().components.map((c) => ({
        ...c,
        confidence: "confirmed" as const,
        citation:
          c.layer === "discount"
            ? {
                source: "manual" as const,
                sourceUrl: "https://www.myer.com.au",
              }
            : c.citation,
      })),
      confidence: "confirmed",
    });
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={rec} stores={stores} />,
    );
    expect(html).toContain("You save $77.00");
    expect(html).not.toContain("including unverified layers");
    expect(html).toContain("Best verified plan");
    expect(html).not.toContain("DealStack verified");
  });

  it("never uses an internal DealStack record or homepage as verification evidence", () => {
    const rec = cashRec({
      components: [cashRec().components[0]],
      verifiedSaving: 0,
      confidence: "needs-verification",
      citations: [{ source: "manual", sourceUrl: "/" }],
    });
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={rec} stores={stores} />,
    );
    expect(html).toContain("0 of 1 verified");
    expect(html).toContain("DealStack record");
    expect(html).toContain("No public evidence links");
    expect(html).not.toContain("DealStack verified");
    expect(html).not.toContain('href="/">DealStack record');
  });

  it("separates included, excluded and reward layers without duplication", () => {
    const rec = cashRec({
      components: [
        {
          ...cashRec().components[0],
          label: "10% promo code",
        },
        {
          layer: "cashback",
          label: "6% ShopBack cashback",
          valuePercent: 6,
          valueDollars: 27,
          optional: true,
          citation: {
            source: "manual",
            sourceUrl: "https://www.shopback.com.au",
          },
          confidence: "confirmed",
          note: "Gift-card payment compatibility is not confirmed.",
        },
        {
          layer: "gift-card",
          label: "5% gift-card saving",
          valuePercent: 5,
          valueDollars: 25,
          optional: true,
          citation: { source: "manual", sourceUrl: "/" },
          confidence: "needs-verification",
        },
        {
          layer: "points",
          label: "2 points per $1",
          pointsEarned: 900,
          valueDollars: 4.5,
          optional: false,
          citation: {
            source: "freepoints",
            sourceUrl: "https://www.freepoints.com.au",
          },
          confidence: "confirmed",
        },
      ],
      pointsEarned: 900,
      pointsValueDollars: 4.5,
    });
    const html = renderToStaticMarkup(
      <StackRecommendationCard recommendation={rec} stores={stores} />,
    );

    expect(html).toContain("Included in recommended plan");
    expect(html).toContain("Available but not included");
    expect(html).toContain("Points and later value");
    expect(html).toContain("Offer type: Discount code · 10% · $50.00");
    expect(html).toContain(
      "Not included — Gift-card payment compatibility is not confirmed.",
    );
    expect(html).toContain(
      "Not included — DealStack does not have enough compatibility evidence.",
    );
    expect(html).toContain(
      "Shown separately as estimated rewards value and not deducted from cash paid.",
    );
    expect(occurrences(html, "10% promo code")).toBe(1);
    expect(occurrences(html, "Offer type: Cashback")).toBe(1);
    expect(occurrences(html, "5% gift-card saving")).toBe(1);
    expect(occurrences(html, "2 points per $1")).toBe(1);
  });
});
