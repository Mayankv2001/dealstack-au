import { describe, expect, it } from "vitest";
import {
  buildWeeklyPickCard,
  buildWeeklyPickCards,
  highlightMeta,
  resolveComponentLabels,
  type WeeklyPickLookups,
} from "../../lib/offers/weeklyPicks";
import type {
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
  WeeklyDeal,
  WeeklyHighlight,
} from "../../lib/offers/types";

/**
 * Pure weeklyPicks mapper tests — offline, fixed clock (never the real clock;
 * the hidden-clock lesson from the deterministic-test-clock fix applies to new
 * code too).
 */

const NOW = new Date("2026-06-20T12:00:00+10:00");

function giftCard(over: Partial<GiftCardOffer> = {}): GiftCardOffer {
  return {
    id: "gc-1",
    brand: "Ultimate",
    discountPercent: 5,
    channel: "membership-portal",
    source: "RACV",
    acceptedAtMerchantIds: ["jb-hifi"],
    pointsOnPurchase: null,
    capDollars: null,
    expiryDate: null,
    startDate: null,
    citations: [{ source: "gcdb", sourceUrl: "https://www.gcdb.com.au" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    ...over,
  };
}

function cashback(over: Partial<CashbackOffer> = {}): CashbackOffer {
  return {
    id: "cb-1",
    merchantId: "myer",
    provider: "ShopBack",
    ratePercent: 6,
    flatAmount: null,
    capDollars: null,
    isUpsized: false,
    excludesGiftCardPayment: false,
    termsSummary: "Sample terms.",
    expiryDate: null,
    citations: [{ source: "manual", sourceUrl: "https://www.shopback.com.au" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    ...over,
  };
}

function points(over: Partial<PointsOffer> = {}): PointsOffer {
  return {
    id: "pts-1",
    merchantId: "woolworths",
    program: "Everyday Rewards",
    earnRateDisplay: "20x points per $1",
    earnMultiple: 20,
    pointValueCents: 0.5,
    mechanism: "in-store-boost",
    expiryDate: null,
    citations: [{ source: "freepoints", sourceUrl: "https://www.freepoints.com.au" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    ...over,
  };
}

function signal(over: Partial<OzBargainSignal> = {}): OzBargainSignal {
  return {
    id: "sig-1",
    merchantId: "jb-hifi",
    title: "Sample deal",
    summary: "Our own short paraphrase.",
    votesSample: null,
    sentiment: "neutral",
    dealKind: "gift-card",
    sourceUrl: "https://www.ozbargain.com.au/node/900001",
    postedAt: null,
    confidence: "needs-verification",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    isSample: true,
    ...over,
  };
}

function weeklyDeal(over: Partial<WeeklyDeal> = {}): WeeklyDeal {
  return {
    id: "wk-1",
    weekOf: "2026-06-23",
    merchantId: "jb-hifi",
    title: "Best stack: sample pick",
    summary: "Sample summary.",
    highlight: "best-stack",
    componentIds: [],
    citations: [],
    expiryDate: null,
    confidence: "needs-verification",
    ...over,
  };
}

function lookups(over: Partial<WeeklyPickLookups> = {}): WeeklyPickLookups {
  return {
    giftCards: [],
    cashback: [],
    points: [],
    signals: [],
    storeNameById: () => null,
    ...over,
  };
}

describe("highlightMeta", () => {
  const cases: [WeeklyHighlight, string, string][] = [
    ["best-stack", "guide", "emerald"],
    ["gift-card", "gift-card", "violet"],
    ["points", "points", "amber"],
    ["cashback", "cashback", "rose"],
    ["signal", "guide", "orange"],
    ["needs-verification", "guide", "sky"],
  ];

  it.each(cases)("maps %s to kind %s, tone %s", (highlight, kind, tone) => {
    expect(highlightMeta(highlight)).toEqual({ kind, tone });
  });
});

describe("resolveComponentLabels", () => {
  it("resolves one label per known offer type", () => {
    const labels = resolveComponentLabels(["gc-1", "cb-1", "pts-1"], {
      giftCards: [giftCard({ id: "gc-1", brand: "Ultimate", discountPercent: 5 })],
      cashback: [cashback({ id: "cb-1", provider: "ShopBack", ratePercent: 6 })],
      points: [
        points({
          id: "pts-1",
          program: "Everyday Rewards",
          earnRateDisplay: "20x points per $1 (activated offer)",
        }),
      ],
    });
    expect(labels).toEqual([
      "5% off Ultimate gift cards",
      "6% ShopBack cashback",
      "20x points per $1 (activated offer) (Everyday Rewards)",
    ]);
  });

  it("falls back to earnMultiple when earnRateDisplay is empty", () => {
    const labels = resolveComponentLabels(["pts-1"], {
      giftCards: [],
      cashback: [],
      points: [points({ id: "pts-1", earnRateDisplay: "", earnMultiple: 3, program: "Flybuys" })],
    });
    expect(labels).toEqual(["3x (Flybuys)"]);
  });

  it("uses the 'bonus' wording (not '0% off') when discountPercent is 0", () => {
    const labels = resolveComponentLabels(["gc-1"], {
      giftCards: [giftCard({ id: "gc-1", brand: "Coles Group", discountPercent: 0 })],
      cashback: [],
      points: [],
    });
    expect(labels).toEqual(["Coles Group gift card bonus"]);
  });

  it("silently drops an unknown id", () => {
    const labels = resolveComponentLabels(["does-not-exist"], {
      giftCards: [giftCard({ id: "gc-1" })],
      cashback: [],
      points: [],
    });
    expect(labels).toEqual([]);
  });

  it("silently drops a signal id (signals never become labels)", () => {
    const labels = resolveComponentLabels(["sig-1"], {
      giftCards: [],
      cashback: [],
      points: [],
    });
    expect(labels).toEqual([]);
  });
});

describe("buildWeeklyPickCard", () => {
  it("resolves componentIds into a joined highlight strip and subject via storeNameById", () => {
    const card = buildWeeklyPickCard(
      weeklyDeal({ componentIds: ["gc-1", "cb-1"], merchantId: "jb-hifi" }),
      lookups({
        giftCards: [giftCard({ id: "gc-1", brand: "Ultimate", discountPercent: 5 })],
        cashback: [cashback({ id: "cb-1", provider: "ShopBack", ratePercent: 6 })],
        storeNameById: (id) => (id === "jb-hifi" ? "JB Hi-Fi" : null),
      }),
      NOW
    );
    expect(card.highlight).toBe("5% off Ultimate gift cards + 6% ShopBack cashback");
    expect(card.subject).toBe("JB Hi-Fi");
    expect(card.variant).toBe("default");
    expect(card.category).toBe("This week's pick");
    expect(card.lastCheckedAt).toBeNull();
  });

  it("yields highlight: undefined when nothing resolves (pick still renders on title/summary)", () => {
    const card = buildWeeklyPickCard(
      weeklyDeal({ componentIds: ["does-not-exist"] }),
      lookups(),
      NOW
    );
    expect(card.highlight).toBeUndefined();
    expect(card.title).toBe("Best stack: sample pick");
  });

  it("does not add a citation for a sample signal", () => {
    const card = buildWeeklyPickCard(
      weeklyDeal({ componentIds: ["sig-1"], citations: [] }),
      lookups({ signals: [signal({ id: "sig-1", isSample: true })] }),
      NOW
    );
    expect(card.citations).toEqual([]);
  });

  it("adds exactly one citation for a real (non-sample) signal", () => {
    const card = buildWeeklyPickCard(
      weeklyDeal({ componentIds: ["sig-1"], citations: [] }),
      lookups({
        signals: [
          signal({
            id: "sig-1",
            isSample: false,
            sourceUrl: "https://www.ozbargain.com.au/node/900001",
          }),
        ],
      }),
      NOW
    );
    expect(card.citations).toEqual([
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900001" },
    ]);
  });

  it("dedupes a signal citation that duplicates an existing deal citation", () => {
    const card = buildWeeklyPickCard(
      weeklyDeal({
        componentIds: ["sig-1"],
        citations: [
          { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900001" },
        ],
      }),
      lookups({
        signals: [
          signal({
            id: "sig-1",
            isSample: false,
            sourceUrl: "https://www.ozbargain.com.au/node/900001",
          }),
        ],
      }),
      NOW
    );
    expect(card.citations).toEqual([
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900001" },
    ]);
  });

  it("drops unsafe persisted and signal citations", () => {
    const card = buildWeeklyPickCard(
      weeklyDeal({
        componentIds: ["sig-1"],
        citations: [{ source: "manual", sourceUrl: "javascript:alert(1)" }],
      }),
      lookups({
        signals: [
          signal({
            id: "sig-1",
            isSample: false,
            sourceUrl: "https://user:secret@www.ozbargain.com.au/node/1",
          }),
        ],
      }),
      NOW
    );
    expect(card.citations).toEqual([]);
  });

  it("marks expiringSoon true within the window and false outside it", () => {
    const soon = buildWeeklyPickCard(
      weeklyDeal({ expiryDate: "2026-06-25" }), // 5 days after NOW
      lookups(),
      NOW
    );
    const notSoon = buildWeeklyPickCard(
      weeklyDeal({ expiryDate: "2026-09-30" }),
      lookups(),
      NOW
    );
    expect(soon.expiringSoon).toBe(true);
    expect(notSoon.expiringSoon).toBe(false);
  });
});

describe("buildWeeklyPickCards", () => {
  it("sorts by weekOf desc, then title asc", () => {
    const cards = buildWeeklyPickCards(
      [
        weeklyDeal({ id: "a", weekOf: "2026-06-16", title: "Z" }),
        weeklyDeal({ id: "b", weekOf: "2026-06-23", title: "B" }),
        weeklyDeal({ id: "c", weekOf: "2026-06-23", title: "A" }),
      ],
      lookups(),
      NOW
    );
    expect(cards.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("caps at 6 picks", () => {
    const deals = Array.from({ length: 9 }, (_, i) =>
      weeklyDeal({ id: `wk-${i}`, weekOf: "2026-06-23", title: `Pick ${i}` })
    );
    const cards = buildWeeklyPickCards(deals, lookups(), NOW);
    expect(cards).toHaveLength(6);
  });

  it("keys each card by the deal id", () => {
    const cards = buildWeeklyPickCards(
      [weeklyDeal({ id: "wk-unique-id", title: "Same title" })],
      lookups(),
      NOW
    );
    expect(cards[0].id).toBe("wk-unique-id");
  });
});
