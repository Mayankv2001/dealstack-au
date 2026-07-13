import { DEFAULT_POINT_VALUE_CENTS } from "@/lib/giftcards/value";

export interface RewardsProgramme {
  slug: string;
  name: string;
  shortName: string;
  pointValueCents: number;
  transferNote: string;
  description: string;
  claimChecks: string[];
}

/**
 * DealStack-authored programme metadata. Values are disclosed assumptions used
 * by calculators, not cash promises or copied source prose.
 */
export const REWARDS_PROGRAMMES: RewardsProgramme[] = [
  {
    slug: "everyday-rewards",
    name: "Everyday Rewards",
    shortName: "Everyday Rewards",
    pointValueCents: DEFAULT_POINT_VALUE_CENTS["everyday rewards"],
    transferNote: "Transfer outcomes depend on the current programme settings and are not assumed here.",
    description: "Track reviewed Everyday Rewards boosts and keep their estimated value separate from the cash price.",
    claimChecks: ["Activate targeted boosts before shopping.", "Check excluded gift-card products.", "Confirm when points are credited."],
  },
  {
    slug: "flybuys",
    name: "Flybuys",
    shortName: "Flybuys",
    pointValueCents: DEFAULT_POINT_VALUE_CENTS.flybuys,
    transferNote: "Transfer ratios and partner availability can change; verify before transferring.",
    description: "Compare reviewed Flybuys multipliers without presenting points as an immediate cash discount.",
    claimChecks: ["Scan or link the correct member account.", "Activate app offers where required.", "Check product and transaction limits."],
  },
  {
    slug: "qantas-frequent-flyer",
    name: "Qantas Frequent Flyer",
    shortName: "Qantas",
    pointValueCents: DEFAULT_POINT_VALUE_CENTS.qantas,
    transferNote: "Airline redemption value varies materially by route, cabin, fees and availability.",
    description: "Review Qantas Points earning offers using an editable valuation rather than treating points as cash.",
    claimChecks: ["Use the tracked or linked channel stated by the offer.", "Confirm eligible products and spend.", "Allow for the stated points-crediting period."],
  },
  {
    slug: "velocity-frequent-flyer",
    name: "Velocity Frequent Flyer",
    shortName: "Velocity",
    pointValueCents: DEFAULT_POINT_VALUE_CENTS.velocity,
    transferNote: "Transfer bonuses and redemption value vary; the calculator is an estimate only.",
    description: "Review Velocity Points opportunities with eligibility, timing and valuation shown explicitly.",
    claimChecks: ["Register or activate when the promotion requires it.", "Check transfer deadlines and minimums.", "Do not subtract estimated points value from cash paid."],
  },
];

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
