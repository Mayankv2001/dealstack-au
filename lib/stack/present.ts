import type { Confidence } from "@/lib/sources/types";
import type {
  StackComponent,
  StackRecommendation,
  StackWarning,
  StackWarningLevel,
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

/** Honest per-layer status chip label, from the layer's stored confidence. */
export function layerStatusLabel(
  confidence: Confidence
): { label: string; tone: "verified" | "caution" } {
  if (confidence === "confirmed") return { label: "Verified", tone: "verified" };
  if (confidence === "expired-unknown") {
    return { label: "Unable to verify", tone: "caution" };
  }
  return { label: "Unverified", tone: "caution" };
}

const WARNING_LEVEL_RANK: Record<StackWarningLevel, number> = {
  risk: 0,
  caution: 1,
  info: 2,
};

export interface StackConditionsSummary {
  /** The single most severe condition, shown inline. */
  lead: StackWarning | null;
  /** Every condition, most severe first, for the expandable disclosure. */
  all: StackWarning[];
  /** Conditions beyond the lead one. */
  extraCount: number;
}

/**
 * Collapse a stack's warnings into one inline lead condition plus an
 * expandable list — replacing the old stack of repeated warning banners.
 */
export function summariseConditions(
  rec: StackRecommendation
): StackConditionsSummary {
  const all = [...rec.warnings].sort(
    (a, b) => WARNING_LEVEL_RANK[a.level] - WARNING_LEVEL_RANK[b.level]
  );
  return {
    lead: all[0] ?? null,
    all,
    extraCount: Math.max(0, all.length - 1),
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

export interface StackStep {
  title: string;
  description: string;
  /** True for the trailing choose-one caution derived from an optional layer. */
  chooseOne?: boolean;
}

/** Provider named in a cashback layer label, e.g. "ShopBack". */
function cashbackProviderFrom(label: string): string | null {
  return label.match(/\b(ShopBack|TopCashback)\b/)?.[1] ?? null;
}

/**
 * How-to steps derived ONLY from the engine's chosen components — never from
 * raw store columns, so the instructions can never tell a shopper to combine
 * layers the engine excluded as incompatible (the old buildSteps bug).
 * Optional (choose-one) layers become an explicit alternative note instead of
 * an instruction to stack them.
 */
export function buildStackSteps(
  storeName: string,
  rec: StackRecommendation | null
): StackStep[] {
  if (!rec) {
    return [
      {
        title: "Check current promotions",
        description: `No compatible saving stack is verified for ${storeName} right now — watch for reviewed offers instead.`,
      },
    ];
  }
  const included = rec.components.filter((c) => !c.optional);
  const steps: StackStep[] = [];

  const cashback = included.find((c) => c.layer === "cashback");
  if (cashback) {
    const provider = cashbackProviderFrom(cashback.label);
    steps.push({
      title: provider ? `Start at ${provider}` : "Start at the cashback provider",
      description: `Click through to ${storeName} first so the tracked cashback (${cashback.label}) can record your purchase.`,
    });
  }

  const giftCard = included.find((c) => c.layer === "gift-card");
  if (giftCard) {
    steps.push({
      title: "Buy discounted gift cards",
      description: `${giftCard.label} — buy enough to cover your expected checkout total.`,
    });
  }

  const discount = included.find((c) => c.layer === "discount");
  if (discount) {
    steps.push({
      title: discount.code ? "Apply the discount code" : "Apply the discount",
      description:
        discount.note ?? `${discount.label} reduces the checkout price.`,
    });
  }

  const points = included.find((c) => c.layer === "points");
  if (points) {
    steps.push({
      title: "Earn points at checkout",
      description: `${points.label}. Points are rewards, not cash — their value is never subtracted from what you pay.`,
    });
  }

  steps.push(
    giftCard
      ? {
          title: "Pay with your gift cards",
          description:
            "Pay the discounted total with the gift cards you bought below face value.",
        }
      : {
          title: "Pay as usual",
          description: cashback
            ? "Pay as usual, then wait for the cashback to confirm."
            : "Pay as usual and keep the receipts for any conditions above.",
        }
  );

  for (const alternative of rec.components.filter((c) => c.optional)) {
    steps.push({
      title: "Alternative, not an extra layer",
      description: `${alternative.label} — ${alternative.note ?? "use it instead of the conflicting layer, not together."}`,
      chooseOne: true,
    });
  }

  return steps;
}

export interface LayerUncertaintyDetails {
  acquisition: string;
  redemption: string;
  warnings: string[];
}

/**
 * Explain only verdicts that need shopper attention. Fully compatible and
 * likely-compatible layers stay compact; uncertain or blocked layers expose
 * the engine's exact acquisition/redemption reasons without recomputing them.
 */
export function layerUncertaintyDetails(
  component: StackComponent
): LayerUncertaintyDetails | null {
  if (
    component.compatibilityStatus !== "requires-verification" &&
    component.compatibilityStatus !== "insufficient-evidence" &&
    component.compatibilityStatus !== "incompatible"
  ) {
    return null;
  }
  if (!component.compatibilityStages) return null;
  return {
    acquisition: component.compatibilityStages.acquisition.reason,
    redemption: component.compatibilityStages.redemption.reason,
    warnings: [...new Set(component.compatibilityWarnings ?? [])].slice(0, 3),
  };
}
