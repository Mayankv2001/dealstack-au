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
  product: GiftCardProduct | null;
  acceptance: GiftCardAcceptanceRow | null;
  role: "included" | "alternative" | "available";
  activeApproved: boolean;
  directApplicability: boolean;
  excluded: boolean;
  exclusionReason: string | null;
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
  futureCreditValue: number | null;
  redemptionChannels: string[];
  evidenceLabel: string;
  evidenceFreshness: "current" | "stale" | "not-checked";
  maxUsableAmount: number | null;
  /** Product limit per physical/digital card; never treated as total coverage. */
  perCardMaximum: number | null;
  /** Minimum count implied by a recorded per-card maximum. null = unknown. */
  estimatedCardCount: number | null;
  denominationRequirement: string | null;
  purchaseFriction: number;
  orderedSteps: string[];
}

export interface RetailerGiftCardPlan {
  merchantId: string;
  merchantName: string;
  productTitle: string | null;
  listedPrice: number | null;
  giftCardOptions: RetailerGiftCardOption[];
  excludedGiftCardOptions: RetailerGiftCardOption[];
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
