import type { Confidence } from "@/lib/sources/types";
import type {
  StackComponent,
  StackRecommendation,
} from "@/lib/offers/types";

/**
 * Presentation-layer derivations for Best stacks.
 *
 * These functions ONLY read fields the stack engine already produced
 * (lib/stack/buildStack.ts) — qualification, ordering, trust wording and
 * layer-compatibility labels. They never recompute effective prices, savings or
 * which layers are compatible; the engine remains the single source of truth.
 */

/**
 * Minimum effective discount (percent) for a stack to earn a place in the
 * default Best stacks list. Anything at or below this is a marginal/near-zero
 * saving and is not shown as a "best" stack. Documented in docs/deals-discovery.md.
 */
export const MIN_BEST_STACK_DISCOUNT_PERCENT = 1;

/** Number of Best stacks shown before "View all stacks" reveals the rest. */
export const BEST_STACK_INITIAL_COUNT = 5;

/**
 * A cash stack qualifies for Best stacks when it delivers a real, immediate
 * out-of-pocket saving: a positive total saving, an effective discount above the
 * threshold, and at least one non-optional discount / gift-card / cashback layer
 * that actually reduces the price.
 */
export function qualifiesAsBestStack(rec: StackRecommendation): boolean {
  if (rec.kind !== "cash") return false;
  if (rec.totalSaving <= 0) return false;
  if (rec.effectiveDiscountPercent < MIN_BEST_STACK_DISCOUNT_PERCENT) return false;
  return rec.components.some(
    (c) =>
      !c.optional &&
      c.layer !== "points" &&
      (c.valueDollars ?? 0) > 0
  );
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  "expired-unknown": 0,
  "needs-verification": 1,
  confirmed: 2,
};

/**
 * Rank qualified cash stacks by the strongest useful combination: biggest cash
 * saving, then deeper effective discount, then higher confidence, then a stable
 * alphabetical tiebreak. Returns a new array; does not mutate the input.
 */
export function rankBestStacks(
  recs: StackRecommendation[]
): StackRecommendation[] {
  return [...recs].sort((a, b) => {
    if (b.totalSaving !== a.totalSaving) return b.totalSaving - a.totalSaving;
    if (b.effectiveDiscountPercent !== a.effectiveDiscountPercent) {
      return b.effectiveDiscountPercent - a.effectiveDiscountPercent;
    }
    const conf = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (conf !== 0) return conf;
    return a.merchantName.localeCompare(b.merchantName);
  });
}

export interface PartitionedStacks {
  /** Qualified cash stacks, strongest first. */
  best: StackRecommendation[];
  /** Points-only rewards opportunities (cash price unchanged). */
  rewards: StackRecommendation[];
}

/**
 * Split raw engine output into the two shopper-facing groups. Stacks that are
 * neither a qualifying cash saving nor a points-earning opportunity are dropped
 * — they have nothing useful to show.
 */
export function partitionStacks(
  recs: StackRecommendation[]
): PartitionedStacks {
  const best = rankBestStacks(recs.filter(qualifiesAsBestStack));
  const rewards = recs.filter(
    (r) => r.kind === "points-only" && r.pointsEarned > 0
  );
  return { best, rewards };
}

export type StackTrustTone = "verified" | "checked" | "caution";

export interface StackTrustStatus {
  label: string;
  tone: StackTrustTone;
}

/**
 * One stack-level trust line, derived from the engine's worst-of confidence and
 * its verification warnings — shown once per card instead of repeating a
 * per-citation "verified" badge.
 */
export function stackTrustStatus(rec: StackRecommendation): StackTrustStatus {
  if (rec.confidence === "expired-unknown") {
    return { label: "Terms may have changed", tone: "caution" };
  }
  const needsVerification = rec.components.filter(
    (c) => c.confidence !== "confirmed"
  ).length;
  if (rec.confidence === "confirmed" && needsVerification === 0) {
    return { label: "All layers source checked", tone: "verified" };
  }
  if (needsVerification === 1) {
    return { label: "1 layer needs verification", tone: "caution" };
  }
  return {
    label: `${needsVerification} layers need verification`,
    tone: "caution",
  };
}

export type LayerCompatibility = "combined" | "choose-one";

/**
 * Whether a layer combines with the others or is a mutually exclusive
 * alternative. Reads only the engine's `optional` flag: the engine marks the
 * weaker side of a gift-card/cashback conflict optional and keeps the chosen
 * compatible layers non-optional.
 */
export function layerCompatibility(
  component: StackComponent
): LayerCompatibility {
  return component.optional ? "choose-one" : "combined";
}

/** True when the stack contains a mutually-exclusive ("choose one") layer. */
export function hasChooseOneLayer(rec: StackRecommendation): boolean {
  return rec.components.some((c) => c.optional);
}
