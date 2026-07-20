import type { GiftCardOffer, GiftCardProduct } from "@/lib/offers/types";
import {
  buildWorkedExample,
  type WorkedExample,
  type WorkedExampleInputs,
} from "./value";

/**
 * Per-denomination worked examples for an offer — the honest comparison table
 * a shopper needs when a promotion spans several card products whose
 * denominations (and purchase fees) differ.
 *
 * The point this surface exists to make: a fixed points award is worth the
 * same on a $25 card as on a $200 card, so the cheapest eligible card is
 * usually the best value — and a fee-bearing eftpos card can be a net LOSS
 * once its purchase fee outweighs the reward. Cash paid, fees and reward
 * estimates stay strictly separate; points are never presented as a checkout
 * discount.
 *
 * Pure derivation. Rows come only from reviewed product records (their
 * denominations and migration-034 purchase fees); when no product rows are
 * published yet, the caller falls back to the single offer-level example — we
 * never invent denominations.
 */

export interface OfferWorkedExampleRow {
  productId: string;
  /** Product display name, e.g. "TCN Party". */
  productName: string;
  /** Face value of this denomination, dollars. */
  denomination: number;
  /** Purchase fee for this denomination (0 when recorded fee-free). */
  purchaseFeeDollars: number;
  /** True when the fee is UNKNOWN (not recorded) rather than zero. */
  feeUnknown: boolean;
  example: WorkedExample;
  /**
   * acquisitionSaving + reward + bonus value − nothing else: the disclosed
   * net benefit estimate in dollars (negative = the fee outweighs the reward).
   * Null when the reward cannot be valued — never guessed.
   */
  netBenefitDollars: number | null;
}

function exampleInputs(
  offer: GiftCardOffer,
  purchaseFeeDollars: number | null,
): WorkedExampleInputs {
  return {
    promotionType: offer.promotionType ?? "discount",
    discountPercent: offer.discountPercent,
    bonusPercent: offer.bonusPercent ?? null,
    pointsMultiplier: offer.pointsMultiplier ?? null,
    fixedPoints: offer.fixedPoints ?? null,
    pointsProgram: offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null,
    pointsValueCents: offer.pointsValueCents ?? null,
    fixedDiscountDollars: offer.fixedDiscountDollars ?? null,
    promoCreditDollars: offer.promoCreditDollars ?? null,
    feeWaiverDollars: offer.feeWaiverDollars ?? null,
    thresholdDollars: offer.thresholdDollars ?? null,
    capDollars: offer.capDollars,
    purchaseFeeDollars,
  };
}

function netBenefit(example: WorkedExample): number | null {
  const reward = example.rewardValueDollars;
  const bonus = example.bonusValueDollars;
  if (reward == null && bonus == null && example.acquisitionSaving === 0) {
    return null;
  }
  return (
    Math.round(
      (example.acquisitionSaving + (reward ?? 0) + (bonus ?? 0)) * 100,
    ) / 100
  );
}

/**
 * One row per (included product, known denomination), best value first —
 * ranked by net benefit estimate, then by lowest cash outlay, then stable by
 * product/denomination so equal-value rows never reorder between renders.
 */
export function buildOfferWorkedExampleRows(
  offer: GiftCardOffer,
  products: readonly GiftCardProduct[],
): OfferWorkedExampleRow[] {
  const includedIds = new Set(
    [offer.productId, ...(offer.includedProductIds ?? [])].filter(Boolean),
  );
  const rows: OfferWorkedExampleRow[] = [];

  for (const product of products) {
    if (!includedIds.has(product.id)) continue;
    for (const denomination of product.denominations ?? []) {
      const feeRecorded = product.purchaseFees != null;
      const fee = feeRecorded
        ? (product.purchaseFees?.[String(denomination)] ?? 0)
        : null;
      const example = buildWorkedExample(exampleInputs(offer, fee), denomination);
      if (!example) continue;
      rows.push({
        productId: product.id,
        productName: product.brand,
        denomination,
        purchaseFeeDollars: fee ?? 0,
        feeUnknown: !feeRecorded,
        example,
        netBenefitDollars: netBenefit(example),
      });
    }
  }

  return rows.sort((a, b) => {
    const aNet = a.netBenefitDollars ?? Number.NEGATIVE_INFINITY;
    const bNet = b.netBenefitDollars ?? Number.NEGATIVE_INFINITY;
    if (aNet !== bNet) return bNet - aNet;
    if (a.example.cashPaid !== b.example.cashPaid) {
      return a.example.cashPaid - b.example.cashPaid;
    }
    const byProduct = a.productName.localeCompare(b.productName);
    if (byProduct !== 0) return byProduct;
    return a.denomination - b.denomination;
  });
}
