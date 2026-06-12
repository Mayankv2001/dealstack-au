export interface StackInput {
  originalPrice: number;
  discountPercent: number;
  cashbackPercent: number;
  giftCardDiscountPercent: number;
}

export interface StackResult {
  originalPrice: number;
  discountSaving: number;
  /** What you pay at checkout after the discount code is applied */
  checkoutPrice: number;
  /** Saved by paying with gift cards bought below face value */
  giftCardSaving: number;
  /** Cashback earned on the checkout amount */
  estimatedCashback: number;
  /** Real out-of-pocket cost after every layer of the stack */
  finalEffectivePrice: number;
  totalSaving: number;
  totalSavingPercent: number;
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

  const giftCardSaving = checkoutPrice * (giftCardDiscountPercent / 100);
  const estimatedCashback = checkoutPrice * (cashbackPercent / 100);

  const finalEffectivePrice = checkoutPrice - giftCardSaving - estimatedCashback;
  const totalSaving = originalPrice - finalEffectivePrice;
  const totalSavingPercent =
    originalPrice > 0 ? (totalSaving / originalPrice) * 100 : 0;

  return {
    originalPrice: round(originalPrice),
    discountSaving: round(discountSaving),
    checkoutPrice: round(checkoutPrice),
    giftCardSaving: round(giftCardSaving),
    estimatedCashback: round(estimatedCashback),
    finalEffectivePrice: round(finalEffectivePrice),
    totalSaving: round(totalSaving),
    totalSavingPercent: round(totalSavingPercent),
  };
}

export const formatAUD = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
