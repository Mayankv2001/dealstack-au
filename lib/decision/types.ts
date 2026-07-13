import type { PublicDeal } from "@/lib/deals/types";
import type { Store } from "@/lib/data";
import type {
  GiftCardAcceptanceRow,
  GiftCardOffer,
  GiftCardProduct,
  StackRecommendation,
} from "@/lib/offers/types";
import type { SmartStackComparison } from "@/lib/stack/smartStack";

export type DecisionTargetKind = "store" | "gift-card" | "programme";

export interface DecisionTarget {
  kind: DecisionTargetKind;
  id: string;
  name: string;
  description: string;
}

export interface AcceptedCardResult {
  product: GiftCardProduct;
  acceptance: GiftCardAcceptanceRow;
}

export interface DecisionFreshness {
  sourceFamilyCount: number;
  sourceLinkCount: number;
  oldestVerificationDate: string | null;
}

/**
 * One public purchase-planning view model. Search pages consume this instead
 * of independently recalculating stacks, rewards, compatibility or trust.
 */
export interface DecisionResult {
  query: string;
  spend: number;
  targetGroups: {
    stores: DecisionTarget[];
    giftCards: DecisionTarget[];
    programmes: DecisionTarget[];
  };
  selectedTarget: DecisionTarget | null;
  ambiguous: boolean;
  stores: Store[];
  productComparisons: SmartStackComparison[];
  bestCashStack: StackRecommendation | null;
  rewardsStack: StackRecommendation | null;
  currentGiftCardOffers: GiftCardOffer[];
  acceptedCards: AcceptedCardResult[];
  alternativeStacks: StackRecommendation[];
  communityPulse: PublicDeal[];
  warnings: string[];
  freshness: DecisionFreshness;
  rankingExplanation: string[];
  partial: boolean;
}
