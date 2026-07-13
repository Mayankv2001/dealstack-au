/**
 * Public Deals discovery model.
 *
 * One normalised `PublicDeal` shape for everything the /deals page can list —
 * community signals, gift cards, cashback, points boosts and editorial picks —
 * so search, filtering, sorting, grouping and the card system operate on a
 * single vocabulary instead of five entity-specific ones. Built exclusively
 * from data that has already crossed the publication boundary (RLS-approved
 * signals, `is_published` offers); nothing here widens what is public.
 */

/** Which family of offer a public deal belongs to. */
export type PublicDealKind =
  | "community"
  | "gift-card"
  | "cashback"
  | "points"
  | "editorial";

export const KIND_LABEL: Record<PublicDealKind, string> = {
  community: "Community deal",
  "gift-card": "Gift card",
  cashback: "Cashback",
  points: "Points boost",
  editorial: "Editor's pick",
};

/**
 * Honest, user-facing trust states mapped from the real record state:
 *  - verified        confidence === "confirmed" (a human confirmed the offer)
 *  - source-checked  admin-curated offer entered from a named source, not yet
 *                    re-confirmed (gift cards / cashback / points / editorial)
 *  - community       community-reported signal reviewed for publication but
 *                    whose price/terms are the community's, not ours
 *  - expired         confidence === "expired-unknown" or past expiry
 */
export type TrustStatus = "verified" | "source-checked" | "community" | "expired";

export interface PublicDeal {
  /** Globally unique across kinds: `${kind}:${entityId}`. */
  id: string;
  kind: PublicDealKind;
  title: string;
  /** Our own short paraphrase — never copied source content. */
  summary: string;
  merchantId: string | null;
  merchantName: string | null;
  /** Display category (first meaningful tag, or the kind label). */
  category: string;
  /** Decoded, deduplicated display tags (may be empty). */
  tags: string[];
  /** Display price text, e.g. "$1,799 (was $1,999)". */
  priceText: string | null;
  /** Parsed current price in dollars, for sorting. */
  priceValue: number | null;
  /** Parsed "was" price in dollars, when the source text states one. */
  wasPrice: number | null;
  /** Best-known saving as a percentage (rate, discount, or parsed). */
  savingPercent: number | null;
  couponCode: string | null;
  trust: TrustStatus;
  membershipRequired: boolean;
  /** Points boosts that must be activated in-app before shopping. */
  activationRequired: boolean;
  targeted: boolean;
  /** "Online", "In-store", "Online & in-store" — null when unknown. */
  channelNote: string | null;
  postedAt: string | null;
  lastCheckedAt: string | null;
  expiryDate: string | null;
  /** Human source name: "OzBargain", "RACV", "ShopBack", a program, … */
  sourceName: string;
  /** Independent publisher family used for corroboration de-duplication. */
  publisherFamily: string;
  /** When external signal counts/facts were captured, not when first posted. */
  capturedAt: string | null;
  /** Safe external offer/source URL, when one exists. */
  sourceUrl: string | null;
  /** Internal detail page, when one exists. */
  detailPath: string | null;
  /** True when the deal's merchant has stackable layers on file. */
  stackable: boolean;
  /** Admin-assigned same-product key for retailer comparison grouping. */
  productGroup: string | null;
  /** Stable source identifier, used only for conservative deduplication. */
  sourceNativeId: string | null;
  /** Community heat, where known. */
  votes: number | null;
  comments: number | null;
  /** Precomputed lowercase haystack for search. */
  searchText: string;
  /** Recommended-sort score (higher is better). */
  score: number;
}

/** A retailer-comparison group of same-product deals. */
export interface DealGroup {
  productGroup: string;
  title: string;
  /** Cheapest-first member deals. */
  options: PublicDeal[];
  fromPrice: number | null;
}

export type DealListItem =
  | { type: "deal"; deal: PublicDeal }
  | { type: "group"; group: DealGroup };
