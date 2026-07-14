import type { PublicDeal } from "@/lib/deals/types";
import type { Store } from "@/lib/data";
import type {
  GiftCardAcceptanceRow,
  GiftCardCompatibilityStatus,
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

export interface RetailerGiftCardOption {
  offer: GiftCardOffer;
  role: "included" | "alternative" | "available";
  compatibilityStatus: GiftCardCompatibilityStatus;
  compatibilityReason: string;
  engineNote: string | null;
  warnings: string[];
  coveredGiftCardValue: number;
  cashPaid: number;
  immediateCashSaving: number;
  bonusCardValue: number | null;
  pointsEarned: number | null;
  estimatedRewardsValue: number | null;
}

export interface RetailerGiftCardPlan {
  merchantId: string;
  merchantName: string;
  productTitle: string | null;
  listedPrice: number | null;
  giftCardOptions: RetailerGiftCardOption[];
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
  /** Retailer-specific ways to fund a selected store or product listing. */
  retailerGiftCardPlans: RetailerGiftCardPlan[];
  acceptedCards: AcceptedCardResult[];
  alternativeStacks: StackRecommendation[];
  communityPulse: PublicDeal[];
  warnings: string[];
  freshness: DecisionFreshness;
  rankingExplanation: string[];
  partial: boolean;
}
