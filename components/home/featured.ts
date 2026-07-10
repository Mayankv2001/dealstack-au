import { SAMPLE_SPEND } from "@/components/StoreCard";
import { calculateStack, type StackResult } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";

/**
 * The store with the biggest dollar saving on a sample $500 spend — used for
 * the hero teaser and the worked example. Pure derivation over the loaded
 * stores, computed once on the server (app/page.tsx) and passed to both
 * islands as a serialisable prop.
 */

export interface FeaturedStack {
  store: Store;
  stack: StackResult;
}

export function pickFeaturedStack(stores: Store[]): FeaturedStack | null {
  let best: FeaturedStack | null = null;
  for (const store of stores) {
    const stack = calculateStack({
      originalPrice: SAMPLE_SPEND,
      discountPercent: store.discountPercent,
      cashbackPercent: store.cashbackPercent,
      giftCardDiscountPercent: store.giftCardDiscountPercent,
    });
    if (!best || stack.totalSaving > best.stack.totalSaving) {
      best = { store, stack };
    }
  }
  return best;
}
