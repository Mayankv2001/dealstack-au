import { describe, expect, it } from "vitest";
import {
  buildSourceResultPool,
  type CardOfferResultRow,
  type CashbackResultRow,
  type GiftCardResultRow,
  type PointsResultRow,
  type SignalResultRow,
  type SourceResultRows,
} from "../../lib/repos/sourceResults";

/**
 * Trust-boundary tests for the Supabase-backed "checked sources" pool
 * (lib/repos/sourceResults.ts). These exercise buildSourceResultPool() —
 * the pure row-filtering step — directly with fixture rows, so no Supabase
 * client needs mocking. The null-vs-[] fallback contract in
 * loadDbSourceResults() itself (demo mode vs configured DB mode) is a thin
 * env-driven wrapper around this pure function and is not re-tested here.
 */

const NOW = new Date("2026-07-10T00:00:00+10:00");

function emptyRows(): SourceResultRows {
  return {
    stores: [],
    cashback: [],
    giftCards: [],
    points: [],
    cardOffers: [],
    signals: [],
  };
}

function makeCashback(over: Partial<CashbackResultRow> = {}): CashbackResultRow {
  return {
    id: "cb-1",
    merchant_id: "myer",
    provider: "ShopBack",
    rate_percent: 5,
    terms_summary: "Terms",
    expiry_date: null,
    last_checked_at: "2026-07-01T00:00:00+10:00",
    confidence: "confirmed",
    ...over,
  };
}

function makeGiftCard(over: Partial<GiftCardResultRow> = {}): GiftCardResultRow {
  return {
    id: "gc-1",
    brand: "Myer",
    discount_percent: 5,
    accepted_at_merchant_ids: ["myer", "david-jones"],
    source_detail_url: null,
    expiry_date: null,
    start_date: null,
    last_checked_at: "2026-07-01T00:00:00+10:00",
    confidence: "confirmed",
    ...over,
  };
}

function makePoints(over: Partial<PointsResultRow> = {}): PointsResultRow {
  return {
    id: "pts-1",
    merchant_id: "myer",
    program: "Qantas",
    earn_rate_display: "3 pts/$1",
    expiry_date: null,
    last_checked_at: "2026-07-01T00:00:00+10:00",
    confidence: "confirmed",
    ...over,
  };
}

function makeSignal(over: Partial<SignalResultRow> = {}): SignalResultRow {
  return {
    id: "sig-1",
    merchant_id: "myer",
    title: "Myer sale",
    summary: "20% off",
    deal_kind: "discount-code",
    source_url: "https://www.ozbargain.com.au/node/1",
    posted_at: "2026-07-01T00:00:00+10:00",
    expiry_date: null,
    last_checked_at: "2026-07-01T00:00:00+10:00",
    confidence: "confirmed",
    is_sample: false,
    price_text: null,
    ...over,
  };
}

function makeReadyCardOffer(
  over: Partial<CardOfferResultRow> = {}
): CardOfferResultRow {
  return {
    id: "card-1",
    provider: "American Express",
    card_name: "Qantas Ultimate Card",
    offer_type: "points_bonus",
    bonus_points: 100000,
    cashback_amount: null,
    statement_credit_amount: null,
    annual_fee: 450,
    eligibility_notes: "New customers only.",
    offer_summary: "Earn 100,000 bonus points on sign-up.",
    source_url: "https://www.americanexpress.com/en-au/",
    expiry_date: "2026-12-31",
    review_by_date: "2026-08-10",
    last_checked_at: "2026-07-01T00:00:00+10:00",
    confidence: "confirmed",
    ...over,
  };
}

describe("buildSourceResultPool — expiry filtering", () => {
  it("drops an expired cashback row", () => {
    const rows = emptyRows();
    rows.cashback = [makeCashback({ expiry_date: "2026-01-01" })];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });

  it("keeps a cashback row expiring today", () => {
    const rows = emptyRows();
    rows.cashback = [makeCashback({ expiry_date: "2026-07-10" })];
    expect(buildSourceResultPool(rows, NOW)).toHaveLength(1);
  });

  it("drops every fan-out result for an expired gift card, not just one merchant", () => {
    const rows = emptyRows();
    rows.giftCards = [makeGiftCard({ expiry_date: "2026-01-01" })];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });

  it("keeps a live gift card's fan-out results for every accepted merchant", () => {
    const rows = emptyRows();
    rows.giftCards = [makeGiftCard()];
    const pool = buildSourceResultPool(rows, NOW);
    expect(pool.map((r) => r.merchantId).sort()).toEqual(["david-jones", "myer"]);
  });

  it("drops an expired points row", () => {
    const rows = emptyRows();
    rows.points = [makePoints({ expiry_date: "2026-01-01" })];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });

  it("drops an expired signal row", () => {
    const rows = emptyRows();
    rows.signals = [makeSignal({ expiry_date: "2026-01-01" })];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });
});

describe("buildSourceResultPool — card offer readiness gate", () => {
  it("includes a public-ready card offer", () => {
    const rows = emptyRows();
    rows.cardOffers = [makeReadyCardOffer()];
    const pool = buildSourceResultPool(rows, NOW);
    expect(pool).toHaveLength(1);
    expect(pool[0].kind).toBe("card");
    expect(pool[0].merchantId).toBeNull();
  });

  it("excludes a card offer with needs-verification confidence", () => {
    const rows = emptyRows();
    rows.cardOffers = [makeReadyCardOffer({ confidence: "needs-verification" })];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });

  it("excludes a card offer with a zero headline amount", () => {
    const rows = emptyRows();
    rows.cardOffers = [makeReadyCardOffer({ bonus_points: 0 })];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });

  it("includes an ongoing card offer with no issuer expiry while review is current", () => {
    const rows = emptyRows();
    rows.cardOffers = [makeReadyCardOffer({ expiry_date: null })];
    expect(buildSourceResultPool(rows, NOW)).toHaveLength(1);
  });

  it("excludes an ongoing card offer after its review deadline", () => {
    const rows = emptyRows();
    rows.cardOffers = [
      makeReadyCardOffer({ expiry_date: null, review_by_date: "2026-07-09" }),
    ];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });

  it("excludes a card offer whose expiry has passed", () => {
    const rows = emptyRows();
    rows.cardOffers = [makeReadyCardOffer({ expiry_date: "2026-01-01" })];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });

  it("excludes a card offer with a non-HTTPS source URL", () => {
    const rows = emptyRows();
    rows.cardOffers = [
      makeReadyCardOffer({ source_url: "http://www.americanexpress.com/en-au/" }),
    ];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });
});

describe("buildSourceResultPool — empty pool", () => {
  it("returns [] (not a fallback signal) when there are no public rows at all", () => {
    expect(buildSourceResultPool(emptyRows(), NOW)).toEqual([]);
  });

  it("returns [] when every row is filtered out", () => {
    const rows: SourceResultRows = {
      stores: [{ id: "myer", name: "Myer" }],
      cashback: [makeCashback({ expiry_date: "2020-01-01" })],
      giftCards: [makeGiftCard({ expiry_date: "2020-01-01" })],
      points: [makePoints({ expiry_date: "2020-01-01" })],
      cardOffers: [makeReadyCardOffer({ confidence: "needs-verification" })],
      signals: [makeSignal({ expiry_date: "2020-01-01" })],
    };
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });
});

describe("buildSourceResultPool — URL trust", () => {
  it("excludes a real signal whose required source URL is unsafe", () => {
    const rows = emptyRows();
    rows.signals = [makeSignal({ source_url: "javascript:alert(1)" })];
    expect(buildSourceResultPool(rows, NOW)).toEqual([]);
  });

  it("keeps a gift-card result but replaces an unsafe optional detail URL", () => {
    const rows = emptyRows();
    rows.giftCards = [
      makeGiftCard({
        accepted_at_merchant_ids: [],
        source_detail_url: "file:///etc/passwd",
      }),
    ];
    const pool = buildSourceResultPool(rows, NOW);
    expect(pool).toHaveLength(1);
    expect(pool[0].sourceUrl).toBe("https://www.gcdb.com.au");
  });
});
