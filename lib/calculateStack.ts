export interface StackInput {
  originalPrice: number;
  discountPercent: number;
  cashbackPercent: number;
  giftCardDiscountPercent: number;
  /** When true, only the stronger of gift-card saving and cashback is used. */
  cashbackExcludesGiftCardPayment?: boolean;
}

export interface StackResult {
  originalPrice: number;
  discountSaving: number;
  /** What you pay at checkout after the discount code is applied */
  checkoutPrice: number;
  /** Saved by paying with gift cards bought below face value */
  giftCardSaving: number;
  /** Cash outlay needed to fund the checkout after any gift-card discount. */
  cashPaidForCheckout: number;
  /** Cashback earned on the checkout amount */
  estimatedCashback: number;
  /** Real out-of-pocket cost after every layer of the stack */
  finalEffectivePrice: number;
  totalSaving: number;
  totalSavingPercent: number;
  excludedLayer: "gift-card" | "cashback" | null;
}

const round = (value: number) => Math.round(value * 100) / 100;

const clampPercent = (value: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;

/**
 * Stacks the three savings layers in the order they apply in practice:
 * 1. Discount code reduces the checkout price.
 * 2. Discounted gift cards reduce what you actually pay for that checkout amount.
 * 3. Cashback is earned on the checkout (tracked) amount.
 */
export function calculateStack(input: StackInput): StackResult {
  const originalPrice =
    Number.isFinite(input.originalPrice) && input.originalPrice > 0
      ? input.originalPrice
      : 0;
  const discountPercent = clampPercent(input.discountPercent);
  const cashbackPercent = clampPercent(input.cashbackPercent);
  const giftCardDiscountPercent = clampPercent(input.giftCardDiscountPercent);

  const discountSaving = originalPrice * (discountPercent / 100);
  const checkoutPrice = originalPrice - discountSaving;

  let giftCardSaving = checkoutPrice * (giftCardDiscountPercent / 100);
  let estimatedCashback = checkoutPrice * (cashbackPercent / 100);
  let excludedLayer: StackResult["excludedLayer"] = null;
  if (
    input.cashbackExcludesGiftCardPayment &&
    giftCardSaving > 0 &&
    estimatedCashback > 0
  ) {
    if (giftCardSaving >= estimatedCashback) {
      estimatedCashback = 0;
      excludedLayer = "cashback";
    } else {
      giftCardSaving = 0;
      excludedLayer = "gift-card";
    }
  }

  const cashPaidForCheckout = checkoutPrice - giftCardSaving;
  const finalEffectivePrice = cashPaidForCheckout - estimatedCashback;
  const totalSaving = originalPrice - finalEffectivePrice;
  const totalSavingPercent =
    originalPrice > 0 ? (totalSaving / originalPrice) * 100 : 0;

  return {
    originalPrice: round(originalPrice),
    discountSaving: round(discountSaving),
    checkoutPrice: round(checkoutPrice),
    giftCardSaving: round(giftCardSaving),
    cashPaidForCheckout: round(cashPaidForCheckout),
    estimatedCashback: round(estimatedCashback),
    finalEffectivePrice: round(finalEffectivePrice),
    totalSaving: round(totalSaving),
    totalSavingPercent: round(totalSavingPercent),
    excludedLayer,
  };
}

export const formatAUD = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
