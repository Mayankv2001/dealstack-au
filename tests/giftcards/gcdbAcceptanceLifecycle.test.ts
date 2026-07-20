import { describe, expect, it } from "vitest";
import {
  contentHashOf,
  runGiftCardIngest,
  type RawItemState,
  type RunIngestDeps,
  type StagedCandidate,
} from "@/lib/giftcards/runIngest";
import { extractOffer } from "@/lib/giftcards/extractOffer";
import { parseGcdbFeed } from "@/lib/giftcards/parseGcdbFeed";
import { validateGiftCardApproval } from "@/lib/giftcards/approvalValidation";
import { giftCardPublishError } from "@/lib/giftcards/publishReadiness";
import {
  getCurrentReviewedGiftCardOffers,
  getGiftCardOffers,
} from "@/lib/repos/offers";
import { buildMarquee } from "@/lib/giftcards/marquee";
import { GC_DEFAULTS, queryGiftCardOffers } from "@/lib/giftcards/publicQuery";
import { buildTermsRows } from "@/lib/giftcards/termsRows";
import { buildOfferWorkedExampleRows } from "@/lib/giftcards/offerWorkedExamples";
import { buildGiftCardOfferCardViewModel } from "@/lib/giftcards/offerCardViewModel";
import { gcdbFixtureGiftCardProducts } from "@/lib/offers/gcdbFixtureOffers";
import type { DbClient } from "@/lib/supabase/server";

/**
 * GCDB 12943 + 12944 acceptance lifecycle — the complete local end-to-end
 * path through the REAL application architecture, no network and no database:
 *
 *   raw source item → parseGcdbFeed → runGiftCardIngest (staged candidate)
 *   → validateGiftCardApproval (the review action's validator)
 *   → approved offer row (the approve action's column mapping)
 *   → giftCardPublishError (the publish gate)
 *   → getCurrentReviewedGiftCardOffers / getGiftCardOffers (the real public
 *     repository: mapGiftCard, value-readiness boundary, tiered ordering)
 *   → buildMarquee (homepage carousel) / queryGiftCardOffers (grid)
 *   → detail-page derivations (terms rows, per-denomination worked examples,
 *     card view-model labels).
 *
 * Source facts verified 2026-07-20 at https://gcdb.com.au/offer/12943/ and
 * https://gcdb.com.au/offer/12944/ — both promotions run 22–28 Jul 2026,
 * in-store only.
 */

// Review clock: before the 22 Jul start, inside the 7-day upcoming window.
const NOW = new Date("2026-07-20T02:00:00Z");
// After the start, before the 28 Jul expiry.
const ACTIVE_NOW = new Date("2026-07-23T02:00:00Z");

const SOURCE = {
  id: "gcdb",
  feedUrl: "https://gcdb.com.au/feed/",
  etag: null,
  lastModified: null,
};

const OFFER_ID_12943 = "gc-gcdb-12943-coles-tcn-flybuys";
const OFFER_ID_12944 = "gc-gcdb-12944-woolworths-everyday-rewards-10x";

// ─── Real-shape source items (same fixtures as runIngest.test.ts) ───────────

function feed(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>GCDB</title>${inner}</channel></rss>`;
}

function fixedPointsItem12943(endsAt = "28 Jul 2026"): string {
  return `<item>
    <title>1,000 bonus Flybuys points on selected TCN gift cards at Coles</title>
    <link>https://gcdb.com.au/offer/12943/</link>
    <guid>https://gcdb.com.au/?post_type=offer&amp;p=12943</guid>
    <description>Earn 1,000 bonus Flybuys points per eligible gift card in-store at Coles. Limit of five eligible gift cards per Flybuys account. No activation required. Starts 22 Jul 2026. Ends ${endsAt}.</description>
    <offer_type>Points</offer_type>
    <offer_store>Coles</offer_store>
    <offer_gc>TCN Party</offer_gc>
    <offer_gc>TCN Teen</offer_gc>
    <offer_gc>TCN Her</offer_gc>
    <offer_gc>TCN Restaurant</offer_gc>
    <offer_gc>TCN Eftpos</offer_gc>
  </item>`;
}

function multiplierItem12944(): string {
  return `<item>
    <title>10x Everyday Rewards points on Restaurant Choice, Cafe Choice and Ultimate gift cards at Woolworths</title>
    <link>https://gcdb.com.au/offer/12944/</link>
    <guid>https://gcdb.com.au/?post_type=offer&amp;p=12944</guid>
    <description>Earn 10x Everyday Rewards points in-store. Limit of five fixed-value cards and two variable-load cards per day. Starts 22 Jul 2026. Ends 28 Jul 2026.</description>
    <offer_type>Points</offer_type>
    <offer_store>Woolworths</offer_store>
    <offer_gc>Restaurant Choice</offer_gc>
    <offer_gc>Cafe Choice</offer_gc>
    <offer_gc>Ultimate</offer_gc>
  </item>`;
}

// ─── In-memory ingest deps (the runIngest harness) ──────────────────────────

function makeDeps(body: string, existing: RawItemState[] = []) {
  const staged: StagedCandidate[] = [];
  const inserts: string[] = [];
  const updates: string[] = [];
  const touches: string[] = [];
  const byExternalId = new Map(existing.map((e) => [e.externalId, e]));
  const deps: RunIngestDeps = {
    now: () => NOW,
    fetchFeed: async () => ({ kind: "ok", body, etag: "e", lastModified: "l" }),
    loadRawItems: async (_sourceId, externalIds) =>
      externalIds
        .map((id) => byExternalId.get(id))
        .filter((x): x is RawItemState => Boolean(x)),
    insertRawItem: async (_sourceId, item) => {
      inserts.push(item.externalId);
      return `raw-${item.externalId}`;
    },
    updateRawItem: async (id) => {
      updates.push(id);
    },
    persistRejectedRawItem: async (_s, item, _h, _v, _e, _t, existingRawItemId) =>
      existingRawItemId ?? `raw-${item.externalId}`,
    touchRawItem: async (id) => {
      touches.push(id);
    },
    stageCandidate: async (_sourceId, candidate) => {
      staged.push(candidate);
    },
    recordSourceState: async () => {},
  };
  return { deps, staged, inserts, updates, touches };
}

// ─── Reviewer approval (real validator + the approve action's row mapping) ──

interface ApprovedRow {
  [column: string]: unknown;
}

/**
 * Approves a staged candidate exactly the way the review action does: the
 * reviewer's (pre-filled) form values run through validateGiftCardApproval —
 * including the structured purchase-limit fields — and the resulting values
 * map to the same gift_card_offers columns as
 * app/admin/(protected)/gift-cards/review/actions.ts. `purchase_limits` is
 * the migration-034 jsonb column persisted by the 035 RPC;
 * `limit_per_customer` keeps the prose.
 */
function approve(
  candidate: StagedCandidate,
  // Source identity is lineage: in production the review action reads the
  // source URL and title from the stored RAW ITEM, never from the form.
  source: { url: string; title: string },
  reviewer: {
    offerId: string;
    brand: string;
    includedProductIds: string[];
    limitProse: string;
    /** Raw form values for the three structured limit inputs ("" = blank). */
    purchaseLimitTotalCards?: string;
    purchaseLimitFixedPerDay?: string;
    purchaseLimitVariablePerDay?: string;
    usageNotes: string[];
  },
): ApprovedRow {
  const x = candidate.extraction;
  const validation = validateGiftCardApproval({
    brand: reviewer.brand,
    seller: x.sellerName ?? "",
    promotionType: x.promotionType,
    channel: "supermarket-promo",
    format: "physical",
    discountPercent: "",
    bonusPercent: "",
    pointsMultiplier: x.pointsMultiplier != null ? String(x.pointsMultiplier) : "",
    fixedPoints: x.fixedPoints != null ? String(x.fixedPoints) : "",
    pointsProgram: x.pointsProgram ?? "",
    pointsValueCents: "",
    fixedDiscountDollars: "",
    promoCreditDollars: "",
    feeWaiverDollars: "",
    thresholdDollars: "",
    rewardDestination: "loyalty-points",
    startDate: x.startsAt ?? "",
    expiryDate: x.expiresAt ?? "",
    expiryTime: "",
    expiryTimezone: "",
    ongoing: false,
    minSpend: "",
    capDollars: "",
    usesPerCustomer: "",
    purchaseLimitTotalCards: reviewer.purchaseLimitTotalCards ?? "",
    purchaseLimitFixedPerDay: reviewer.purchaseLimitFixedPerDay ?? "",
    purchaseLimitVariablePerDay: reviewer.purchaseLimitVariablePerDay ?? "",
    sourceUrl: source.url,
    termsUrl: "",
    promoCode: "",
    australiaOnly: "yes",
    combinableWithSellerPromotions: "",
    membershipRequired: x.membershipRequired,
    activationRequired: x.activationRequired,
    couponRequired: x.couponRequired,
    shippingMayApply: false,
    targeted: x.targeted,
    sourceName: "Gift Card Database",
    sourceText: source.title,
    thresholdText: source.title,
    parentIsCompound: x.parentIsCompound,
    candidateRole: "single-offer",
    subOfferKey: x.subOfferKey,
    sourcePresence: x.sourcePresence,
  });
  if (!validation.ok) throw new Error(`Approval blocked: ${validation.error}`);
  const v = validation.values;

  return {
    id: reviewer.offerId,
    brand: v.brand,
    discount_percent: v.discountPercent ?? 0,
    channel: v.channel,
    source: v.sourceName,
    accepted_at_merchant_ids: [],
    points_on_purchase:
      v.promotionType === "points" && v.pointsProgram
        ? {
            program: v.pointsProgram,
            earnNote: v.fixedPoints
              ? `${v.fixedPoints.toLocaleString("en-AU")} ${v.pointsProgram} points on purchase`
              : `${v.pointsMultiplier}x ${v.pointsProgram} points on purchase`,
          }
        : null,
    cap_dollars: v.capDollars,
    expiry_date: v.expiryDate,
    start_date: v.startDate,
    purchase_location: v.seller,
    purchase_method: "in-store",
    limit_per_customer: reviewer.limitProse,
    accepted_at: [],
    usage_notes: reviewer.usageNotes,
    stack_notes: [],
    source_detail_url: v.sourceUrl,
    citations: [{ source: v.sourceName, sourceUrl: v.sourceUrl }],
    confidence: "confirmed",
    promotion_type: v.promotionType,
    bonus_percent: v.bonusPercent,
    points_multiplier: v.pointsMultiplier,
    fixed_points: v.fixedPoints,
    points_program: v.pointsProgram,
    points_value_cents: v.pointsValueCents,
    membership_required: v.membershipRequired,
    activation_required: v.activationRequired,
    coupon_required: v.couponRequired,
    min_spend: v.minSpend,
    denomination_note: null,
    format: v.format,
    source_name: v.sourceName,
    product_id: null,
    promo_code: v.promoCode,
    expiry_time: v.expiryTime,
    expiry_timezone: v.expiryTimezone,
    uses_per_customer: v.usesPerCustomer,
    shipping_may_apply: v.shippingMayApply,
    australia_only: v.australiaOnly,
    combinable_with_seller_promotions: v.combinableWithSellerPromotions,
    terms_url: v.termsUrl,
    included_product_ids: reviewer.includedProductIds,
    fixed_discount_dollars: v.fixedDiscountDollars,
    promo_credit_dollars: v.promoCreditDollars,
    fee_waiver_dollars: v.feeWaiverDollars,
    threshold_dollars: v.thresholdDollars,
    reward_destination: v.rewardDestination,
    is_ongoing: v.isOngoing,
    targeted: v.targeted,
    source_suboffer_key: v.subOfferKey,
    purchase_limits: v.purchaseLimits,
    source_last_seen_at: NOW.toISOString(),
  };
}

// ─── Realistic published context rows (six active + one later upcoming) ─────

function contextRow(
  id: string,
  startDate: string,
  expiryDate: string,
  discount = 10,
): ApprovedRow {
  return {
    id,
    brand: `Sample brand ${id}`,
    discount_percent: discount,
    channel: "supermarket-promo",
    source: "Reviewed source",
    accepted_at_merchant_ids: [],
    points_on_purchase: null,
    cap_dollars: null,
    expiry_date: expiryDate,
    start_date: startDate,
    purchase_location: "Sample seller",
    purchase_method: "online",
    limit_per_customer: null,
    accepted_at: [],
    usage_notes: [],
    stack_notes: [],
    source_detail_url: "https://example.com/offer",
    promotion_type: "discount",
    bonus_percent: null,
    points_multiplier: null,
    fixed_points: null,
    points_program: null,
    points_value_cents: null,
    fixed_discount_dollars: null,
    promo_credit_dollars: null,
    fee_waiver_dollars: null,
    threshold_dollars: null,
    reward_destination: "checkout-discount",
    is_ongoing: false,
    targeted: false,
    source_suboffer_key: "primary",
    membership_required: false,
    activation_required: false,
    coupon_required: false,
    min_spend: null,
    denomination_note: null,
    format: "digital",
    source_name: "Reviewed source",
    product_id: null,
    source_last_seen_at: NOW.toISOString(),
    promo_code: null,
    expiry_time: null,
    expiry_timezone: null,
    uses_per_customer: null,
    shipping_may_apply: false,
    australia_only: true,
    combinable_with_seller_promotions: null,
    terms_url: null,
    included_product_ids: [],
    citations: [],
    confidence: "confirmed",
    last_checked_at: NOW.toISOString(),
  };
}

const ACTIVE_ROWS: ApprovedRow[] = [
  contextRow("gc-active-1", "2026-07-10", "2026-07-21"),
  contextRow("gc-active-2", "2026-07-10", "2026-07-24"),
  contextRow("gc-active-3", "2026-07-10", "2026-07-26"),
  contextRow("gc-active-4", "2026-07-10", "2026-08-02"),
  contextRow("gc-active-5", "2026-07-10", "2026-08-10"),
  contextRow("gc-active-6", "2026-07-10", "2026-08-18"),
];
const LATER_UPCOMING_ROW = contextRow("gc-upcoming-later", "2026-07-24", "2026-07-31");

function client(rows: unknown[]): DbClient {
  return {
    from: () => ({
      select: async () => ({ data: rows, error: null }),
    }),
  } as unknown as DbClient;
}

// ─── The lifecycle ──────────────────────────────────────────────────────────

async function runLifecycle() {
  const body = feed(fixedPointsItem12943() + multiplierItem12944());
  const { deps, staged } = makeDeps(body);
  const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

  const coles = staged.find((c) => c.rawItemId === "raw-12943")!;
  const woolworths = staged.find((c) => c.rawItemId === "raw-12944")!;

  // The stored raw items supply the source lineage at approval time.
  const rawByExternalId = new Map(
    parseGcdbFeed(body).map((item) => [item.externalId, item]),
  );
  const raw12943 = rawByExternalId.get("12943")!;
  const raw12944 = rawByExternalId.get("12944")!;

  const row12943 = approve(coles, { url: raw12943.canonicalUrl, title: raw12943.title }, {
    offerId: OFFER_ID_12943,
    brand: "TCN Party, TCN Teen, TCN Her, TCN Restaurant, TCN Eftpos",
    includedProductIds: [
      "tcn-party",
      "tcn-teen",
      "tcn-her",
      "tcn-restaurant",
      "tcn-eftpos",
    ],
    limitProse: "Limit of five eligible gift cards per Flybuys account",
    purchaseLimitTotalCards: "5",
    usageNotes: [
      "In-store at Coles only.",
      "No activation required — points are awarded for the purchase itself.",
      "Points credit timing is not stated at the source; check your Flybuys activity after purchase.",
    ],
  });
  const row12944 = approve(woolworths, { url: raw12944.canonicalUrl, title: raw12944.title }, {
    offerId: OFFER_ID_12944,
    brand: "Restaurant Choice, Cafe Choice, Ultimate",
    includedProductIds: ["restaurant-choice", "cafe-choice", "ultimate-selected"],
    limitProse: "Limit of five fixed-value cards and two variable-load cards per day",
    purchaseLimitFixedPerDay: "5",
    purchaseLimitVariablePerDay: "2",
    usageNotes: ["In-store at Woolworths only."],
  });
  // last_checked_at is stamped by the approve RPC's audit trail in production.
  row12943.last_checked_at = NOW.toISOString();
  row12944.last_checked_at = NOW.toISOString();

  const allRows = [...ACTIVE_ROWS, LATER_UPCOMING_ROW, row12943, row12944];
  return { metrics, staged, coles, woolworths, raw12943, raw12944, row12943, row12944, allRows };
}

describe("GCDB 12943 — complete local lifecycle", () => {
  it("stages, approves, publishes and maps the offer with every source fact intact", async () => {
    const { metrics, coles, raw12943, row12943, allRows } = await runLifecycle();
    expect(metrics.itemsNew).toBe(2);
    expect(metrics.candidatesNew).toBe(2);
    expect(coles.reviewStatus).toBe("new");
    // Source lineage comes from the stored raw item, never a form.
    expect(raw12943.canonicalUrl).toBe("https://gcdb.com.au/offer/12943/");

    // The extractor found every structured fact — nothing was hand-typed.
    expect(coles.extraction).toMatchObject({
      promotionType: "points",
      fixedPoints: 1000,
      pointsMultiplier: null,
      pointsProgram: "Flybuys",
      sellerName: "Coles",
      startsAt: "2026-07-22",
      expiresAt: "2026-07-28",
      activationRequired: false,
    });

    // The publish gate passes on the approved facts.
    expect(
      giftCardPublishError({
        brand: String(row12943.brand),
        seller: String(row12943.purchase_location),
        sourceUrl: String(row12943.source_detail_url),
        promotionType: String(row12943.promotion_type),
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: null,
        fixedPoints: 1000,
        pointsProgram: "Flybuys",
        fixedDiscountDollars: null,
        promoCreditDollars: null,
        feeWaiverDollars: null,
        thresholdDollars: null,
        membershipRequired: false,
        expiryDate: String(row12943.expiry_date),
        isOngoing: false,
      }),
    ).toBeNull();

    // The REAL public repository maps the row (incl. purchase_limits jsonb).
    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client(allRows),
      now: NOW,
    });
    const offer = offers.find((o) => o.id === OFFER_ID_12943)!;
    expect(offer).toMatchObject({
      id: OFFER_ID_12943,
      promotionType: "points",
      fixedPoints: 1000,
      pointsMultiplier: null,
      pointsProgram: "Flybuys",
      rewardDestination: "loyalty-points",
      purchaseLocation: "Coles",
      purchaseMethod: "in-store",
      startDate: "2026-07-22",
      expiryDate: "2026-07-28",
      activationRequired: false,
      purchaseLimits: {
        totalCards: 5,
        fixedValueCardsPerDay: null,
        variableLoadCardsPerDay: null,
      },
      sourceDetailUrl: "https://gcdb.com.au/offer/12943/",
      includedProductIds: [
        "tcn-party",
        "tcn-teen",
        "tcn-her",
        "tcn-restaurant",
        "tcn-eftpos",
      ],
    });

    // Detail-page derivations: five-card limit, fee-aware examples, labels.
    const terms = buildTermsRows(offer);
    expect(terms.map((row) => row.value)).toContain(
      "5 eligible gift cards in total per customer/account",
    );

    const exampleRows = buildOfferWorkedExampleRows(
      offer,
      gcdbFixtureGiftCardProducts,
    );
    expect(exampleRows).toHaveLength(9);
    const eftpos100 = exampleRows.find(
      (row) => row.productId === "tcn-eftpos" && row.denomination === 100,
    )!;
    expect(eftpos100.purchaseFeeDollars).toBe(5.95);
    expect(eftpos100.example.cashPaid).toBe(105.95);
    expect(eftpos100.example.points).toBe(1000);
    // 1,000 Flybuys at the disclosed 0.5c/pt = $5; fee $5.95 → net −$0.95.
    expect(eftpos100.netBenefitDollars).toBe(-0.95);
    const eftpos200 = exampleRows.find(
      (row) => row.productId === "tcn-eftpos" && row.denomination === 200,
    )!;
    expect(eftpos200.purchaseFeeDollars).toBe(7.95);
    // Points value never reduces checkout cash: cash paid is face + fee.
    expect(eftpos200.example.cashPaid).toBe(207.95);
    expect(exampleRows[0]).toMatchObject({
      productId: "tcn-party",
      denomination: 25,
      netBenefitDollars: 5,
    });

    const vm = buildGiftCardOfferCardViewModel(offer, NOW);
    expect(vm.valueBadge).toBe("1,000 POINTS");
    expect(vm.headline).toBe("1,000 Flybuys points per eligible card");
    expect(vm.dateLabel).toMatch(/^Starts 22 Jul 2026/);
    expect(vm.urgencyLabel).toBeUndefined();
    expect(vm.detailHref).toBe(`/gift-cards/${OFFER_ID_12943}`);
  });
});

describe("GCDB 12944 — complete local lifecycle", () => {
  it("stages, approves, publishes and maps the multiplier offer with distinct per-day limits", async () => {
    const { woolworths, raw12944, row12944, allRows } = await runLifecycle();
    expect(woolworths.reviewStatus).toBe("new");
    expect(raw12944.canonicalUrl).toBe("https://gcdb.com.au/offer/12944/");
    expect(woolworths.extraction).toMatchObject({
      promotionType: "points",
      pointsMultiplier: 10,
      fixedPoints: null,
      pointsProgram: "Everyday Rewards",
      sellerName: "Woolworths",
      startsAt: "2026-07-22",
      expiresAt: "2026-07-28",
    });

    expect(
      giftCardPublishError({
        brand: String(row12944.brand),
        seller: String(row12944.purchase_location),
        sourceUrl: String(row12944.source_detail_url),
        promotionType: "points",
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: 10,
        fixedPoints: null,
        pointsProgram: "Everyday Rewards",
        fixedDiscountDollars: null,
        promoCreditDollars: null,
        feeWaiverDollars: null,
        thresholdDollars: null,
        membershipRequired: false,
        expiryDate: "2026-07-28",
        isOngoing: false,
      }),
    ).toBeNull();

    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client(allRows),
      now: NOW,
    });
    const offer = offers.find((o) => o.id === OFFER_ID_12944)!;
    expect(offer).toMatchObject({
      id: OFFER_ID_12944,
      promotionType: "points",
      pointsMultiplier: 10,
      fixedPoints: null,
      pointsProgram: "Everyday Rewards",
      purchaseLocation: "Woolworths",
      purchaseMethod: "in-store",
      startDate: "2026-07-22",
      expiryDate: "2026-07-28",
      purchaseLimits: {
        totalCards: null,
        fixedValueCardsPerDay: 5,
        variableLoadCardsPerDay: 2,
      },
      sourceDetailUrl: "https://gcdb.com.au/offer/12944/",
      includedProductIds: [
        "restaurant-choice",
        "cafe-choice",
        "ultimate-selected",
      ],
    });

    // Separate fixed-value and variable-load rows — never merged.
    const values = buildTermsRows(offer).map((row) => row.value);
    expect(values).toContain("Limit 5 per day");
    expect(values).toContain("Limit 2 per day");

    const vm = buildGiftCardOfferCardViewModel(offer, NOW);
    expect(vm.valueBadge).toBe("10× POINTS");
    expect(vm.headline).toBe("10× Everyday Rewards points");
    expect(vm.dateLabel).toMatch(/^Starts 22 Jul 2026/);
    expect(vm.detailHref).toBe(`/gift-cards/${OFFER_ID_12944}`);
  });
});

describe("homepage carousel placement and surface parity", () => {
  it("puts both offers on desktop slide three (positions 7–8 of 9) before their start date", async () => {
    const { allRows } = await runLifecycle();
    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client(allRows),
      now: NOW,
    });
    const marquee = buildMarquee(offers, NOW);
    expect(marquee.slides).toHaveLength(9);
    expect(marquee.liveCount).toBe(9);
    const ids = marquee.slides.map((slide) => slide.id);
    // Active tier (ending soonest) fills slides 1–2; the upcoming tier starts
    // at position 7 — the first card of desktop slide three.
    expect(ids.slice(0, 6)).toEqual([
      "gc-active-1",
      "gc-active-2",
      "gc-active-3",
      "gc-active-4",
      "gc-active-5",
      "gc-active-6",
    ]);
    expect(ids[6]).toBe(OFFER_ID_12943); // position 7 → slide 3
    expect(ids[7]).toBe(OFFER_ID_12944); // position 8 → slide 3
    expect(ids[8]).toBe("gc-upcoming-later"); // position 9 → slide 3
    // No duplicates anywhere in the track.
    expect(new Set(ids).size).toBe(ids.length);

    // Upcoming slides carry the explicit "Starts …" label and the
    // not-active-yet caveat; never an urgency chip.
    const slide12943 = marquee.slides[6];
    expect(slide12943.dateLabel).toBe("Starts 22 Jul 2026 · ends 28 Jul 2026");
    expect(slide12943.urgencyLabel).toBeUndefined();
    expect(slide12943.caveat).toMatch(/not active yet/i);
    expect(slide12943.isRewardOnly).toBe(true);
  });

  it("keeps the homepage carousel and /gift-cards grid on the same eligible-offer set", async () => {
    const { allRows } = await runLifecycle();
    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client(allRows),
      now: NOW,
    });
    const gridIds = queryGiftCardOffers(offers, GC_DEFAULTS, NOW).map((o) => o.id);
    expect(new Set(gridIds)).toEqual(new Set(offers.map((o) => o.id)));
  });

  it("excludes both offers from the stack ENGINE until their start date, then admits them", async () => {
    const { allRows } = await runLifecycle();
    const before = await getGiftCardOffers({
      staticMode: false,
      client: client(allRows),
      now: NOW,
    });
    expect(before.map((o) => o.id)).not.toContain(OFFER_ID_12943);
    expect(before.map((o) => o.id)).not.toContain(OFFER_ID_12944);

    const after = await getGiftCardOffers({
      staticMode: false,
      client: client(allRows),
      now: ACTIVE_NOW,
    });
    expect(after.map((o) => o.id)).toContain(OFFER_ID_12943);
    expect(after.map((o) => o.id)).toContain(OFFER_ID_12944);
  });

  it("moves the offers into the active tier with honest labels on/after the start date", async () => {
    const { allRows } = await runLifecycle();
    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client(allRows),
      now: ACTIVE_NOW,
    });
    const ids = offers.map((o) => o.id);
    // gc-active-1 expired on 21 Jul; both GCDB offers (ending 28 Jul) now rank
    // by expiry within the active tier.
    expect(ids).not.toContain("gc-active-1");
    expect(ids.slice(0, 4)).toEqual([
      "gc-active-2",
      "gc-active-3",
      OFFER_ID_12943,
      OFFER_ID_12944,
    ]);
    const vm = buildGiftCardOfferCardViewModel(
      offers.find((o) => o.id === OFFER_ID_12943)!,
      ACTIVE_NOW,
    );
    expect(vm.dateLabel).toMatch(/^Ends 28 Jul 2026/);
  });
});

describe("idempotency and duplicate prevention", () => {
  it("reprocessing identical source content only touches the raw item", async () => {
    const body = feed(fixedPointsItem12943() + multiplierItem12944());
    const parsed = parseGcdbFeed(body);
    const existing: RawItemState[] = parsed.map((item) => ({
      id: `raw-${item.externalId}`,
      externalId: item.externalId,
      contentHash: contentHashOf(item),
      processingStatus: "parsed",
      extraction: extractOffer(item),
      openCandidateId: null,
      approvedOfferId:
        item.externalId === "12943" ? OFFER_ID_12943 : OFFER_ID_12944,
    }));
    const { deps, staged, inserts, touches } = makeDeps(body, existing);
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);
    expect(metrics.itemsNew).toBe(0);
    expect(metrics.itemsUnchanged).toBe(2);
    expect(inserts).toEqual([]);
    expect(staged).toEqual([]);
    expect(touches.sort()).toEqual(["raw-12943", "raw-12944"]);
  });

  it("changed source content stages a CHANGED candidate against the same offer — never a duplicate", async () => {
    const before = parseGcdbFeed(feed(fixedPointsItem12943()))[0];
    const existing: RawItemState = {
      id: "raw-12943",
      externalId: "12943",
      contentHash: contentHashOf(before),
      processingStatus: "parsed",
      extraction: extractOffer(before),
      openCandidateId: null,
      approvedOfferId: OFFER_ID_12943,
    };
    const changed = feed(fixedPointsItem12943("4 Aug 2026"));
    const { deps, staged, inserts, updates } = makeDeps(changed, [existing]);
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);
    expect(metrics.itemsNew).toBe(0);
    expect(metrics.itemsUpdated).toBe(1);
    expect(inserts).toEqual([]);
    expect(updates).toEqual(["raw-12943"]);
    expect(staged).toHaveLength(1);
    expect(staged[0].rawItemId).toBe("raw-12943");
    expect(staged[0].reviewStatus).toBe("changed");
    expect(staged[0].extraction.expiresAt).toBe("2026-08-04");
  });
});
