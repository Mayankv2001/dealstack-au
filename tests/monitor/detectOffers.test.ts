import { describe, expect, it, vi } from "vitest";
import { detectOffersFromItem, type FeedItemView } from "../../lib/monitor/detectOffers";
import {
  runDetection,
  type DetectionPersistence,
  type ResolvedTarget,
} from "../../lib/monitor/runDetection";
import { buildOfferChangeCandidate } from "../../lib/monitor/offerChanges";

/**
 * Detection heuristics + runDetection orchestration — pure, offline. These pin
 * the conservative "provider AND value AND merchant" contract and the dedupe /
 * dry-run behaviour that keeps the staging-only step safe.
 */

function item(partial: Partial<FeedItemView> & { rawTitle: string }): FeedItemView {
  return {
    rawSummary: "",
    link: `https://example.com/${encodeURIComponent(partial.rawTitle)}`,
    categories: [],
    ...partial,
  };
}

describe("detectOffersFromItem — cashback", () => {
  it("detects a permitted portal + percent + known merchant", () => {
    const [d] = detectOffersFromItem(
      item({ rawTitle: "15% Cashback at Myer via ShopBack (Max $30)" })
    );
    expect(d).toBeDefined();
    expect(d.sourceType).toBe("cashback");
    expect(d.sourceName).toBe("ShopBack");
    expect(d.merchantId).toBe("myer");
    expect(d.proposedValue).toBe("15%");
    expect(d.detectedRateOrDiscount).toBe("15%");
    expect(d.confidence).toBe("needs-verification");
    expect(d.targetId).toBeNull();
    expect(d.previousValue).toBeNull();
  });

  it("matches TopCashback with canonical casing", () => {
    const [d] = detectOffersFromItem(
      item({ rawTitle: "Myer 8% cashback via topcashback" })
    );
    expect(d.sourceType).toBe("cashback");
    expect(d.sourceName).toBe("TopCashback");
    expect(d.proposedValue).toBe("8%");
  });
});

describe("detectOffersFromItem — gift card", () => {
  it("detects 'gift card' + percent + merchant as gift_card via OzBargain", () => {
    const [d] = detectOffersFromItem(
      item({ rawTitle: "10% off Ultimate Gift Cards @ Coles" })
    );
    expect(d.sourceType).toBe("gift_card");
    expect(d.sourceName).toBe("OzBargain");
    expect(d.merchantId).toBe("coles");
    expect(d.proposedValue).toBe("10%");
  });
});

describe("detectOffersFromItem — points", () => {
  it("detects a named programme + Nx multiplier + merchant as points", () => {
    const [d] = detectOffersFromItem(
      item({ rawTitle: "20x Everyday Rewards Points on Groceries at Woolworths" })
    );
    expect(d.sourceType).toBe("points");
    expect(d.sourceName).toBe("OzBargain");
    expect(d.merchantId).toBe("woolworths");
    expect(d.proposedValue).toBe("20x");
  });
});

describe("detectOffersFromItem — hard skips & non-detections", () => {
  it("never detects a Cashrewards mention (hard skip)", () => {
    expect(
      detectOffersFromItem(item({ rawTitle: "Bonus Cashback via Cashrewards at Myer" }))
    ).toEqual([]);
  });

  it("skips even when a real provider match co-occurs with Cashrewards", () => {
    // Would otherwise be a valid ShopBack cashback detection — the Cashrewards
    // mention must veto it, never re-badge it under a different provider.
    expect(
      detectOffersFromItem(
        item({ rawTitle: "15% Cashback at Myer via ShopBack and Cashrewards" })
      )
    ).toEqual([]);
  });

  it("returns nothing for a percent with no provider/source", () => {
    expect(
      detectOffersFromItem(item({ rawTitle: "25% off storewide at Myer" }))
    ).toEqual([]);
  });

  it("returns nothing for a provider with no percent", () => {
    expect(
      detectOffersFromItem(item({ rawTitle: "ShopBack bonus at Myer today" }))
    ).toEqual([]);
  });

  it("returns nothing when the merchant is not a known store", () => {
    expect(
      detectOffersFromItem(item({ rawTitle: "15% Cashback at Kmart via ShopBack" }))
    ).toEqual([]);
  });

  it("returns nothing for a named programme with no multiplier", () => {
    expect(
      detectOffersFromItem(
        item({ rawTitle: "Everyday Rewards points on groceries at Woolworths" })
      )
    ).toEqual([]);
  });
});

// ── runDetection orchestration (fake persistence, no DB) ──────────────────────

const NO_TARGETS = {
  resolveCashbackTarget: async () => null,
  resolveGiftCardTarget: async () => null,
  resolvePointsTarget: async () => null,
};

function fakePersistence(
  overrides: Partial<DetectionPersistence> & {
    items: FeedItemView[];
    known?: { hashes: string[]; urls: string[] };
  }
): { deps: DetectionPersistence; insert: ReturnType<typeof vi.fn> } {
  const insert = vi.fn(async (rows: unknown[]) => rows.length);
  const deps: DetectionPersistence = {
    listRecentNewFeedItems: async () => overrides.items,
    listKnownCandidateKeys: async () =>
      overrides.known ?? { hashes: [], urls: [] },
    ...NO_TARGETS,
    insertCandidates: insert,
    ...overrides,
  };
  return { deps, insert };
}

const SINCE = "2026-07-08T00:00:00.000Z";

describe("runDetection — dedupe and dry-run", () => {
  it("collapses the same offer seen twice in a batch to one candidate", async () => {
    const dup = item({ rawTitle: "15% Cashback at Myer via ShopBack" });
    const { deps, insert } = fakePersistence({ items: [dup, { ...dup }] });
    const summary = await runDetection(deps, { sinceIso: SINCE, dryRun: false });
    expect(summary.scanned).toBe(2);
    expect(summary.detected).toBe(2);
    expect(summary.deduped).toBe(1);
    expect(summary.inserted).toBe(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toHaveLength(1);
  });

  it("drops a candidate whose content_hash is already staged", async () => {
    const one = item({ rawTitle: "15% Cashback at Myer via ShopBack" });
    const known = buildOfferChangeCandidate(detectOffersFromItem(one)[0]);
    const { deps, insert } = fakePersistence({
      items: [one],
      known: { hashes: [known.content_hash], urls: [] },
    });
    const summary = await runDetection(deps, { sinceIso: SINCE, dryRun: false });
    expect(summary.detected).toBe(1);
    expect(summary.deduped).toBe(0);
    expect(summary.inserted).toBe(0);
    // Empty batch still calls insert (which no-ops for []), but stages nothing.
    expect(insert.mock.calls[0][0]).toHaveLength(0);
  });

  it("drops a candidate whose detected_url is already staged (ignored stays ignored)", async () => {
    const one = item({ rawTitle: "15% Cashback at Myer via ShopBack" });
    const { deps } = fakePersistence({
      items: [one],
      known: { hashes: [], urls: [one.link] },
    });
    const summary = await runDetection(deps, { sinceIso: SINCE, dryRun: false });
    expect(summary.deduped).toBe(0);
    expect(summary.inserted).toBe(0);
  });

  it("dry-run reports counts but inserts nothing", async () => {
    const one = item({ rawTitle: "10% off Ultimate Gift Cards @ Coles" });
    const { deps, insert } = fakePersistence({ items: [one] });
    const summary = await runDetection(deps, { sinceIso: SINCE, dryRun: true });
    expect(summary.detected).toBe(1);
    expect(summary.deduped).toBe(1);
    expect(summary.inserted).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it("fills targetId + previousValue from a resolved target", async () => {
    const one = item({ rawTitle: "15% Cashback at Myer via ShopBack" });
    const resolved: ResolvedTarget = { id: "cb-myer-shopback", currentValue: "8%" };
    const insert = vi.fn(async (rows: unknown[]) => rows.length);
    const deps: DetectionPersistence = {
      listRecentNewFeedItems: async () => [one],
      listKnownCandidateKeys: async () => ({ hashes: [], urls: [] }),
      resolveCashbackTarget: async () => resolved,
      resolveGiftCardTarget: async () => null,
      resolvePointsTarget: async () => null,
      insertCandidates: insert,
    };
    await runDetection(deps, { sinceIso: SINCE, dryRun: false });
    const staged = insert.mock.calls[0][0] as {
      target_id: string | null;
      previous_value: string | null;
      proposed_value: string;
    }[];
    expect(staged[0].target_id).toBe("cb-myer-shopback");
    expect(staged[0].previous_value).toBe("8%");
    expect(staged[0].proposed_value).toBe("15%");
  });
});
