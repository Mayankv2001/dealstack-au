import { DEFAULT_POINT_VALUE_CENTS } from "@/lib/giftcards/value";

/**
 * Two tiers, because Australian shoppers reason about them differently:
 * you EARN in a supermarket programme and REDEEM through an airline one.
 * Only supermarket programmes carry a `transfer`.
 */
export type ProgrammeTier = "airline" | "supermarket";

export interface ProgrammeTransfer {
  /** Slug of the airline programme these points can move into. */
  toSlug: string;
  /**
   * The ordinary conversion, e.g. 2,000 Flybuys → 1,000 Velocity. A BASELINE,
   * not a guarantee: it is set by the programmes, not by us, and it changes.
   * Always presented next to `TRANSFER_BONUS_NOTE`, never as a settled rate.
   */
  base: { from: number; to: number };
}

export interface RewardsProgramme {
  slug: string;
  name: string;
  shortName: string;
  tier: ProgrammeTier;
  pointValueCents: number;
  /** Present on supermarket programmes only. */
  transfer?: ProgrammeTransfer;
  transferNote: string;
  description: string;
  claimChecks: string[];
}

/**
 * The reason a base ratio must never be shown on its own: transfer bonuses run
 * periodically and are the whole point of timing a transfer. At our own default
 * valuations a base transfer is roughly value-neutral (2,000 supermarket points
 * at 0.5c = $10; 1,000 airline points at 1c = $10), so the bonus is where the
 * upside actually comes from.
 */
export const TRANSFER_BONUS_NOTE =
  "Transfer bonuses (for example +15%) run from time to time and change the effective rate — check the programme for a current promotion before transferring.";

/**
 * Short form for space-constrained surfaces (the homepage block). A base ratio
 * must never appear without one of these two beside it.
 */
export const TRANSFER_BONUS_SHORT =
  "Base rate — transfer bonuses run periodically.";

/**
 * DealStack-authored programme metadata. Values are disclosed assumptions used
 * by calculators, not cash promises or copied source prose.
 */
export const REWARDS_PROGRAMMES: RewardsProgramme[] = [
  {
    slug: "everyday-rewards",
    name: "Everyday Rewards",
    shortName: "Everyday Rewards",
    tier: "supermarket",
    pointValueCents: DEFAULT_POINT_VALUE_CENTS["everyday rewards"],
    transfer: { toSlug: "qantas-frequent-flyer", base: { from: 2000, to: 1000 } },
    transferNote: "Transfer outcomes depend on the current programme settings and are not assumed here.",
    description: "Track reviewed Everyday Rewards boosts and keep their estimated value separate from the cash price.",
    claimChecks: ["Activate targeted boosts before shopping.", "Check excluded gift-card products.", "Confirm when points are credited."],
  },
  {
    slug: "flybuys",
    name: "Flybuys",
    shortName: "Flybuys",
    tier: "supermarket",
    pointValueCents: DEFAULT_POINT_VALUE_CENTS.flybuys,
    transfer: { toSlug: "velocity-frequent-flyer", base: { from: 2000, to: 1000 } },
    transferNote: "Transfer ratios and partner availability can change; verify before transferring.",
    description: "Compare reviewed Flybuys multipliers without presenting points as an immediate cash discount.",
    claimChecks: ["Scan or link the correct member account.", "Activate app offers where required.", "Check product and transaction limits."],
  },
  {
    slug: "qantas-frequent-flyer",
    name: "Qantas Frequent Flyer",
    shortName: "Qantas",
    tier: "airline",
    pointValueCents: DEFAULT_POINT_VALUE_CENTS.qantas,
    transferNote: "Airline redemption value varies materially by route, cabin, fees and availability.",
    description: "Review Qantas Points earning offers using an editable valuation rather than treating points as cash.",
    claimChecks: ["Use the tracked or linked channel stated by the offer.", "Confirm eligible products and spend.", "Allow for the stated points-crediting period."],
  },
  {
    slug: "velocity-frequent-flyer",
    name: "Velocity Frequent Flyer",
    shortName: "Velocity",
    tier: "airline",
    pointValueCents: DEFAULT_POINT_VALUE_CENTS.velocity,
    transferNote: "Transfer bonuses and redemption value vary; the calculator is an estimate only.",
    description: "Review Velocity Points opportunities with eligibility, timing and valuation shown explicitly.",
    claimChecks: ["Register or activate when the promotion requires it.", "Check transfer deadlines and minimums.", "Do not subtract estimated points value from cash paid."],
  },
];

/** Airline programmes, in the order the grouped views lead with them. */
export function airlineProgrammes(): RewardsProgramme[] {
  return REWARDS_PROGRAMMES.filter((p) => p.tier === "airline");
}

/** Supermarket programmes whose points transfer into `slug`. */
export function feedersFor(slug: string): RewardsProgramme[] {
  return REWARDS_PROGRAMMES.filter((p) => p.transfer?.toSlug === slug);
}

/**
 * "2,000 Flybuys → 1,000 Velocity". Returns null for airline programmes, which
 * have no feeder relationship of their own. Never render this without
 * TRANSFER_BONUS_NOTE beside it — the base rate alone reads as a fixed promise.
 */
export function transferRatioLabel(programme: RewardsProgramme): string | null {
  const transfer = programme.transfer;
  if (!transfer) return null;
  const target = REWARDS_PROGRAMMES.find((p) => p.slug === transfer.toSlug);
  if (!target) return null;
  const fmt = (n: number) => n.toLocaleString("en-AU");
  return `${fmt(transfer.base.from)} ${programme.shortName} → ${fmt(transfer.base.to)} ${target.shortName}`;
}

export function findRewardsProgramme(value: string): RewardsProgramme | null {
  const needle = value.trim().toLowerCase();
  return (
    REWARDS_PROGRAMMES.find(
      (programme) =>
        programme.slug === needle ||
        programme.name.toLowerCase() === needle ||
        programme.shortName.toLowerCase() === needle ||
        programme.name.toLowerCase().includes(needle)
    ) ?? null
  );
}
