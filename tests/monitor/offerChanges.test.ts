import { describe, expect, it } from "vitest";
import {
  APPROVED_FEED_SOURCE_TYPES,
  buildOfferChangeCandidate,
  buildOfferChangeCandidates,
  dedupeOfferChangeCandidates,
  isApplyPlan,
  isApprovedForFetch,
  parseRateValue,
  planOfferApplication,
  selectMonitorableSources,
  type ApplyCandidateView,
  type DetectedOffer,
} from "../../lib/monitor/offerChanges";

const baseDetected: DetectedOffer = {
  sourceType: "cashback",
  sourceName: "ShopBack",
  merchantId: "myer",
  targetId: "cb-shopback-myer-1234",
  detectedTitle: "Myer cashback increased",
  detectedRateOrDiscount: "10%",
  detectedUrl: "https://www.shopback.com.au/myer",
  previousValue: "6%",
  proposedValue: "10%",
  confidence: "needs-verification",
  rawSummary: "<p>Up to <b>10%</b> cashback</p>",
};

describe("offerChanges — staging candidate creation", () => {
  it("maps a detected offer into a normalised candidate insert", () => {
    const candidate = buildOfferChangeCandidate(baseDetected);
    expect(candidate.source_type).toBe("cashback");
    expect(candidate.source_name).toBe("ShopBack");
    expect(candidate.merchant_id).toBe("myer");
    expect(candidate.target_id).toBe("cb-shopback-myer-1234");
    expect(candidate.proposed_value).toBe("10%");
    expect(candidate.previous_value).toBe("6%");
    // raw_summary has HTML stripped.
    expect(candidate.raw_summary).toBe("Up to 10% cashback");
    expect(candidate.content_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("defaults optional fields safely", () => {
    const candidate = buildOfferChangeCandidate({
      sourceType: "promo",
      sourceName: "OzBargain",
      detectedTitle: "",
      proposedValue: "15",
    });
    expect(candidate.merchant_id).toBeNull();
    expect(candidate.target_id).toBeNull();
    expect(candidate.previous_value).toBeNull();
    expect(candidate.detected_title).toBe("(untitled)");
    expect(candidate.confidence).toBe("needs-verification");
    expect(candidate.detected_url).toBe("");
  });

  it("produces a deterministic hash; a new proposed value yields a new hash", () => {
    const a = buildOfferChangeCandidate(baseDetected);
    const b = buildOfferChangeCandidate({ ...baseDetected });
    expect(a.content_hash).toBe(b.content_hash);

    const changed = buildOfferChangeCandidate({
      ...baseDetected,
      proposedValue: "12%",
    });
    expect(changed.content_hash).not.toBe(a.content_hash);
  });
});

describe("offerChanges — duplicate detection", () => {
  it("drops candidates whose content_hash is already staged", () => {
    const candidate = buildOfferChangeCandidate(baseDetected);
    const deduped = dedupeOfferChangeCandidates([candidate], {
      hashes: [candidate.content_hash],
    });
    expect(deduped).toHaveLength(0);
  });

  it("drops candidates whose detected_url is already staged", () => {
    const candidate = buildOfferChangeCandidate(baseDetected);
    const deduped = dedupeOfferChangeCandidates([candidate], {
      urls: ["https://www.shopback.com.au/myer"],
    });
    expect(deduped).toHaveLength(0);
  });

  it("de-duplicates within a single batch (by hash and by url)", () => {
    // Same merchant + url + proposed value → identical hash → one row.
    const dupHash = buildOfferChangeCandidates([baseDetected, { ...baseDetected }]);
    expect(dupHash).toHaveLength(1);

    // Different hash but same source URL → still treated as a duplicate.
    const sameUrl = dedupeOfferChangeCandidates([
      buildOfferChangeCandidate(baseDetected),
      buildOfferChangeCandidate({ ...baseDetected, proposedValue: "11%" }),
    ]);
    expect(sameUrl).toHaveLength(1);
  });

  it("keeps genuinely distinct candidates", () => {
    const kept = dedupeOfferChangeCandidates(
      [
        buildOfferChangeCandidate(baseDetected),
        buildOfferChangeCandidate({
          ...baseDetected,
          merchantId: "jb-hifi",
          detectedUrl: "https://www.shopback.com.au/jb-hifi",
          proposedValue: "3%",
        }),
      ],
      { hashes: [], urls: [] }
    );
    expect(kept).toHaveLength(2);
  });
});

describe("offerChanges — apply only after admin review", () => {
  const newCashback: ApplyCandidateView = {
    sourceType: "cashback",
    reviewState: "new",
    targetId: "cb-shopback-myer-1234",
    proposedValue: "10%",
  };

  it("plans a single-column update for a reviewed, targeted candidate", () => {
    const plan = planOfferApplication(newCashback);
    expect(isApplyPlan(plan)).toBe(true);
    if (!isApplyPlan(plan)) return;
    expect(plan).toEqual({
      table: "cashback_offers",
      column: "rate_percent",
      id: "cb-shopback-myer-1234",
      value: 10,
    });
  });

  it("maps each source type to the right offer table + column", () => {
    const gift = planOfferApplication({
      sourceType: "gift_card",
      reviewState: "new",
      targetId: "gc-1",
      proposedValue: "5%",
    });
    const points = planOfferApplication({
      sourceType: "points",
      reviewState: "new",
      targetId: "pts-1",
      proposedValue: "3x",
    });
    const promo = planOfferApplication({
      sourceType: "promo",
      reviewState: "new",
      targetId: "myer",
      proposedValue: "15% off",
    });
    expect(isApplyPlan(gift) && gift.table).toBe("gift_card_offers");
    expect(isApplyPlan(gift) && gift.column).toBe("discount_percent");
    expect(isApplyPlan(points) && points.table).toBe("points_offers");
    expect(isApplyPlan(points) && points.value).toBe(3);
    expect(isApplyPlan(promo) && promo.table).toBe("stores");
    expect(isApplyPlan(promo) && promo.value).toBe(15);
  });

  it("refuses to apply without a resolved target", () => {
    const plan = planOfferApplication({ ...newCashback, targetId: null });
    expect(isApplyPlan(plan)).toBe(false);
  });

  it("refuses to apply a non-numeric proposed value", () => {
    const plan = planOfferApplication({
      ...newCashback,
      proposedValue: "see site",
    });
    expect(isApplyPlan(plan)).toBe(false);
  });

  it("never applies a candidate that is already applied (no double-apply)", () => {
    const plan = planOfferApplication({ ...newCashback, reviewState: "applied" });
    expect(isApplyPlan(plan)).toBe(false);
  });
});

describe("offerChanges — ignored/duplicate items do not affect public data", () => {
  it("yields no write plan for an ignored candidate", () => {
    const plan = planOfferApplication({
      sourceType: "cashback",
      reviewState: "ignored",
      targetId: "cb-shopback-myer-1234",
      proposedValue: "10%",
    });
    expect(isApplyPlan(plan)).toBe(false);
    if (!isApplyPlan(plan)) expect(plan.skip).toMatch(/ignored/);
  });

  it("yields no write plan for a duplicate candidate", () => {
    const plan = planOfferApplication({
      sourceType: "gift_card",
      reviewState: "duplicate",
      targetId: "gc-1",
      proposedValue: "5%",
    });
    expect(isApplyPlan(plan)).toBe(false);
  });
});

describe("offerChanges — parseRateValue", () => {
  it("extracts the first number from free text", () => {
    expect(parseRateValue("10%")).toBe(10);
    expect(parseRateValue("up to 6.5% cashback")).toBe(6.5);
    expect(parseRateValue("3x points")).toBe(3);
    expect(parseRateValue("no number")).toBeNull();
  });
});

describe("offerChanges — safe-source gate", () => {
  const sources = [
    { id: "1", sourceType: "ozbargain", isEnabled: true },
    { id: "2", sourceType: "ozbargain", isEnabled: false },
    { id: "3", sourceType: "pointhacks", isEnabled: true },
    { id: "4", sourceType: "manual-url", isEnabled: true },
    { id: "5", sourceType: "provider-feed", isEnabled: true },
  ];

  it("keeps only enabled sources of a verified feed type", () => {
    const safe = selectMonitorableSources(sources);
    expect(safe.map((s) => s.id)).toEqual(["1"]);
  });

  it("skips unapproved source types even when enabled", () => {
    const safe = selectMonitorableSources([
      { id: "ph", sourceType: "pointhacks", isEnabled: true },
    ]);
    expect(safe).toHaveLength(0);
  });

  // listDueEnabledFeeds (the live monitor fetch path) filters with this same
  // gate — both via `.in("source_type", APPROVED_FEED_SOURCE_TYPES)` on the
  // query and isApprovedForFetch() in JS — so these enumerated cases pin what
  // the cron can ever fetch.
  it("never fetches a registry-only type, even when enabled (live-path gate)", () => {
    const registryOnly = [
      "pointhacks",
      "freepoints",
      "gcdb",
      "provider-feed",
      "manual-url",
    ];
    for (const sourceType of registryOnly) {
      expect(isApprovedForFetch(sourceType)).toBe(false);
      expect(
        selectMonitorableSources([{ id: "x", sourceType, isEnabled: true }])
      ).toHaveLength(0);
    }
  });

  it("approves exactly the verified feed types (currently ozbargain only)", () => {
    expect([...APPROVED_FEED_SOURCE_TYPES]).toEqual(["ozbargain"]);
    expect(isApprovedForFetch("ozbargain")).toBe(true);
  });
});
