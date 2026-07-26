import { describe, expect, it } from "vitest";
import {
  REWARDS_PROGRAMMES,
  TRANSFER_BONUS_NOTE,
  TRANSFER_BONUS_SHORT,
  airlineProgrammes,
  feedersFor,
  transferRatioLabel,
} from "@/lib/rewards/programmes";
import {
  countForProgramme,
  feederOffersFor,
  offersForProgramme,
} from "@/lib/rewards/offerCounts";
import {
  bonusHeadline,
  bonusPercentLabel,
  bonusesInto,
} from "@/lib/rewards/transferBonus";
import { makeGiftCard } from "./factories";
import type { PointsOffer, PointsTransferBonus } from "@/lib/offers/types";

/**
 * The airline/supermarket grouping: which programme leads, what feeds it, and
 * that the offer counts the hub shows are the same ones the per-programme page
 * lists.
 */

const points = (over: Partial<PointsOffer> = {}): PointsOffer =>
  ({
    id: "pts-1",
    merchantId: "coles",
    program: "Flybuys",
    earnRateDisplay: "1 point per $1",
    earnMultiple: 1,
    pointValueCents: 0.5,
    mechanism: "base-earn",
    expiryDate: null,
    citations: [{ source: "manual", sourceUrl: "/" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    ...over,
  }) as PointsOffer;

describe("programme tiers", () => {
  it("leads with exactly the two airline programmes", () => {
    expect(airlineProgrammes().map((p) => p.shortName)).toEqual([
      "Qantas",
      "Velocity",
    ]);
  });

  it("gives every programme a tier, and a transfer only to the feeders", () => {
    for (const programme of REWARDS_PROGRAMMES) {
      expect(["airline", "supermarket"]).toContain(programme.tier);
      // An airline programme must not claim to transfer somewhere else.
      if (programme.tier === "airline") {
        expect(programme.transfer).toBeUndefined();
      } else {
        expect(programme.transfer).toBeDefined();
      }
    }
  });
});

describe("feeder relationships", () => {
  it("routes Coles/Flybuys to Velocity and Everyday Rewards to Qantas", () => {
    expect(feedersFor("velocity-frequent-flyer").map((p) => p.slug)).toEqual([
      "flybuys",
    ]);
    expect(feedersFor("qantas-frequent-flyer").map((p) => p.slug)).toEqual([
      "everyday-rewards",
    ]);
  });

  it("points every transfer at a programme that actually exists", () => {
    const slugs = new Set(REWARDS_PROGRAMMES.map((p) => p.slug));
    for (const programme of REWARDS_PROGRAMMES) {
      if (programme.transfer) {
        expect(slugs.has(programme.transfer.toSlug)).toBe(true);
      }
    }
  });

  it("labels the base ratio, and only for feeders", () => {
    const flybuys = REWARDS_PROGRAMMES.find((p) => p.slug === "flybuys")!;
    const velocity = REWARDS_PROGRAMMES.find(
      (p) => p.slug === "velocity-frequent-flyer",
    )!;
    expect(transferRatioLabel(flybuys)).toBe("2,000 Flybuys → 1,000 Velocity");
    expect(transferRatioLabel(velocity)).toBeNull();
  });

  it("keeps both bonus caveats non-empty — a bare ratio reads as a promise", () => {
    // The compact homepage variant shows the ratio too, so it needs its own.
    expect(TRANSFER_BONUS_NOTE).toMatch(/bonus/i);
    expect(TRANSFER_BONUS_NOTE).toMatch(/check/i);
    expect(TRANSFER_BONUS_SHORT).toMatch(/bonus/i);
    expect(TRANSFER_BONUS_SHORT.length).toBeLessThan(TRANSFER_BONUS_NOTE.length);
  });
});

describe("offer counts", () => {
  const flybuys = REWARDS_PROGRAMMES.find((p) => p.slug === "flybuys")!;
  const qantas = REWARDS_PROGRAMMES.find(
    (p) => p.slug === "qantas-frequent-flyer",
  )!;

  it("counts points and gift-card offers against the right programme", () => {
    const pool = [
      points({ id: "a", program: "Flybuys" }),
      points({ id: "b", program: "3 Qantas pts per $1 (Qantas Shopping)" }),
    ];
    const cards = [
      makeGiftCard({
        id: "gc-flybuys",
        pointsOnPurchase: { program: "Flybuys", earnNote: "1 point per $1" },
      }),
    ];
    expect(countForProgramme(flybuys, pool, cards)).toBe(2);
    expect(countForProgramme(qantas, pool, cards)).toBe(1);
  });

  it("matches the free-text programme column, not an exact string", () => {
    const pool = [
      points({ id: "c", program: "2 Velocity pts per $1 (Velocity e-Store)" }),
    ];
    const velocity = REWARDS_PROGRAMMES.find(
      (p) => p.slug === "velocity-frequent-flyer",
    )!;
    expect(countForProgramme(velocity, pool, [])).toBe(1);
  });

  it("returns an honest zero rather than borrowing another programme's offers", () => {
    const pool = [points({ id: "d", program: "Flybuys" })];
    const everyday = REWARDS_PROGRAMMES.find(
      (p) => p.slug === "everyday-rewards",
    )!;
    const result = offersForProgramme(everyday, pool, []);
    expect(result.total).toBe(0);
    expect(result.points).toEqual([]);
    expect(result.giftCards).toEqual([]);
  });
});

describe("feeder offer roll-up", () => {
  const velocity = REWARDS_PROGRAMMES.find(
    (p) => p.slug === "velocity-frequent-flyer",
  )!;
  const flybuys = REWARDS_PROGRAMMES.find((p) => p.slug === "flybuys")!;

  it("lists a feeder's offers under the airline programme they transfer into", () => {
    // The Coles boost says "Flybuys", so the Velocity page only reaches it
    // through the transfer link — this is the whole point of the roll-up.
    const pool = [
      points({ id: "coles", program: "Flybuys" }),
      points({ id: "direct", program: "Velocity" }),
    ];
    const groups = feederOffersFor(velocity, pool, []);
    expect(groups.map((g) => g.programme.slug)).toEqual(["flybuys"]);
    expect(groups[0].offers.points.map((o) => o.id)).toEqual(["coles"]);
  });

  it("does not double-count the programme's own offers as feeder offers", () => {
    const pool = [points({ id: "direct", program: "Velocity" })];
    expect(feederOffersFor(velocity, pool, [])).toEqual([]);
  });

  it("drops a feeder with nothing current rather than showing an empty heading", () => {
    const pool = [points({ id: "ev", program: "Everyday Rewards" })];
    expect(feederOffersFor(velocity, pool, [])).toEqual([]);
  });

  it("gives a supermarket programme no feeders — it is the bottom of the chain", () => {
    const pool = [points({ id: "coles", program: "Flybuys" })];
    expect(feederOffersFor(flybuys, pool, [])).toEqual([]);
  });

  it("rolls up gift-card offers alongside points offers", () => {
    const cards = [
      makeGiftCard({
        id: "gc-flybuys",
        pointsOnPurchase: { program: "Flybuys", earnNote: "1 point per $1" },
      }),
    ];
    const groups = feederOffersFor(velocity, [], cards);
    expect(groups[0].offers.giftCards.map((o) => o.id)).toEqual(["gc-flybuys"]);
    expect(groups[0].offers.total).toBe(1);
  });
});

describe("transfer bonuses", () => {
  const bonus = (over: Partial<PointsTransferBonus> = {}): PointsTransferBonus => ({
    id: "xfer-1",
    fromProgramme: "flybuys",
    toProgramme: "velocity-frequent-flyer",
    bonusPercentMin: 5,
    bonusPercentMax: 15,
    startsOn: null,
    expiryDate: "2026-07-28",
    conditionsNote: null,
    citations: [{ source: "freepoints", sourceUrl: "https://www.freepoints.com.au/x" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-07-26T00:00:00+10:00",
    ...over,
  });

  it("labels a range and a flat bonus differently", () => {
    expect(bonusPercentLabel(bonus())).toBe("5–15%");
    expect(
      bonusPercentLabel(bonus({ bonusPercentMin: 15, bonusPercentMax: 15 })),
    ).toBe("15%");
  });

  it("names the source programme in the headline", () => {
    expect(bonusHeadline(bonus())).toBe("Bonus 5–15% transferring from Flybuys");
  });

  it("degrades to the raw slug rather than throwing on an unknown programme", () => {
    expect(bonusHeadline(bonus({ fromProgramme: "mystery-points" }))).toContain(
      "mystery-points",
    );
  });

  it("routes a bonus to its destination programme only", () => {
    const all = [bonus(), bonus({ id: "xfer-2", toProgramme: "qantas-frequent-flyer" })];
    expect(bonusesInto("velocity-frequent-flyer", all).map((b) => b.id)).toEqual([
      "xfer-1",
    ]);
    expect(bonusesInto("qantas-frequent-flyer", all).map((b) => b.id)).toEqual([
      "xfer-2",
    ]);
    expect(bonusesInto("flybuys", all)).toEqual([]);
  });

  it("ranks the biggest bonus first", () => {
    const all = [
      bonus({ id: "small", bonusPercentMax: 10 }),
      bonus({ id: "big", bonusPercentMax: 30 }),
    ];
    expect(bonusesInto("velocity-frequent-flyer", all).map((b) => b.id)).toEqual([
      "big",
      "small",
    ]);
  });
});
