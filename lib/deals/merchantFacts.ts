import type {
  StackComponent,
  StackRecommendation,
} from "@/lib/offers/types";

/**
 * Per-merchant stack facts for the /deals list — derived ONLY from what the
 * stack engine already computed (lib/stack/buildStack.ts). This replaces the
 * old hard-coded "Compatibility: unknown — check plan" line with the engine's
 * real verdicts, mapped to four honest shopper-facing states. Nothing here
 * recomputes savings or compatibility.
 */

/** The four explicit shopper-facing layer states. */
export type LayerState =
  | "works"
  | "conditional"
  | "no-stack"
  | "insufficient-evidence";

export const LAYER_STATE_LABEL: Record<LayerState, string> = {
  works: "Works",
  conditional: "Conditional",
  "no-stack": "Does not stack",
  "insufficient-evidence": "Not enough evidence",
};

export interface MerchantLayerFact {
  state: LayerState;
  /** Short shopper-facing label, e.g. "5% gift card" or "6% ShopBack". */
  label: string;
  /** Why the state is what it is — required for every non-"works" state. */
  reason: string | null;
}

export interface MerchantStackFacts {
  merchantId: string;
  coupon: MerchantLayerFact | null;
  giftCard: MerchantLayerFact | null;
  cashback: MerchantLayerFact | null;
  points: MerchantLayerFact | null;
  /** Engine outputs echoed for list-level display (basePrice = example spend). */
  basePrice: number;
  payAtCheckout: number;
  cashbackLater: number;
  pointsValueDollars: number;
  verifiedSaving: number;
  totalSaving: number;
}

/** Short label for a layer, from its engine fields (no free-text parsing). */
function factLabel(component: StackComponent): string {
  const pct =
    typeof component.valuePercent === "number" && component.valuePercent > 0
      ? `${component.valuePercent}% `
      : "";
  if (component.layer === "discount") {
    return component.code ? `${pct}code ${component.code}` : `${pct}code`;
  }
  if (component.layer === "gift-card") return `${pct}gift card`.trim();
  if (component.layer === "cashback") return `${pct}cashback`.trim();
  return component.pointsEarned
    ? `${component.pointsEarned.toLocaleString("en-AU")} pts`
    : "Points";
}

/**
 * Map one engine component to a shopper-facing state.
 *
 * Precedence: an explicit engine compatibility verdict wins; otherwise the
 * layer's stored confidence and optional/conflict flags decide. A layer is
 * only ever "works" when it is included, confirmed and (where the engine
 * assessed it) fully compatible.
 */
export function layerFactFromComponent(
  component: StackComponent,
): MerchantLayerFact {
  const label = factLabel(component);
  const status = component.compatibilityStatus;
  if (status === "incompatible") {
    return {
      state: "no-stack",
      label,
      reason: component.compatibilityReason ?? component.note ?? null,
    };
  }
  if (status === "insufficient-evidence") {
    return {
      state: "insufficient-evidence",
      label,
      reason:
        component.compatibilityReason ??
        "No acceptance evidence is recorded yet.",
    };
  }
  if (status === "requires-verification") {
    return {
      state: "conditional",
      label,
      reason:
        component.compatibilityReason ??
        "Confirm the current terms at the source before relying on it.",
    };
  }
  // A "choose one" alternative never simply works — it conflicts with an
  // included layer (e.g. cashback excluded when paying with gift cards).
  if (component.optional) {
    return {
      state: "conditional",
      label,
      reason:
        component.note ??
        component.compatibilityReason ??
        "Alternative layer — cannot be combined with the included stack.",
    };
  }
  if (component.confidence !== "confirmed") {
    return {
      state: "conditional",
      label,
      reason: "Unverified — confirm the terms at the source before you buy.",
    };
  }
  if (status === "likely-compatible") {
    return {
      state: "conditional",
      label,
      reason:
        component.compatibilityReason ??
        "Likely compatible — check the recorded caveats first.",
    };
  }
  return { state: "works", label, reason: null };
}

function pickFact(
  components: StackComponent[],
  layer: StackComponent["layer"],
): MerchantLayerFact | null {
  // Included layers take precedence over alternatives; the engine already
  // deduplicated to the best offer per layer.
  const candidates = components.filter((c) => c.layer === layer);
  if (candidates.length === 0) return null;
  const chosen = candidates.find((c) => !c.optional) ?? candidates[0];
  return layerFactFromComponent(chosen);
}

/**
 * Derive one facts record per merchant from the engine's recommendations.
 * Merchants without a recommendation simply have no entry — the UI renders an
 * honest "no layers on file" state instead of inventing one.
 */
export function deriveMerchantFacts(
  recommendations: StackRecommendation[],
): Map<string, MerchantStackFacts> {
  const facts = new Map<string, MerchantStackFacts>();
  for (const rec of recommendations) {
    // One rec per merchant is the engine contract; first wins defensively.
    if (facts.has(rec.merchantId)) continue;
    facts.set(rec.merchantId, {
      merchantId: rec.merchantId,
      coupon: pickFact(rec.components, "discount"),
      giftCard: pickFact(rec.components, "gift-card"),
      cashback: pickFact(rec.components, "cashback"),
      points: pickFact(rec.components, "points"),
      basePrice: rec.basePrice,
      payAtCheckout: rec.payAtCheckout,
      cashbackLater: rec.cashbackLater,
      pointsValueDollars: rec.pointsValueDollars,
      verifiedSaving: rec.verifiedSaving,
      totalSaving: rec.totalSaving,
    });
  }
  return facts;
}
