import type { StackRecommendation } from "@/lib/offers/types";
import {
  buildStackRecommendations,
  type StackData,
} from "@/lib/stack/buildStack";
import {
  deriveMerchantFacts,
  type MerchantStackFacts,
} from "./merchantFacts";
import type { DealsParams } from "./params";
import type { PublicDeal } from "./types";

/**
 * Top purchase recommendations for a /deals request with purchase intent
 * (a query, category or store filter). At most three, in a FIXED role order —
 * best verified stack, lowest checkout price, best alternative retailer — so a
 * less-verified option can never visually outrank the verified slot. Pure and
 * deterministic: engine maths comes from lib/stack/buildStack.ts, matching
 * from lib/deals/query.ts.
 */

export type RecommendationRole =
  | "best-verified"
  | "lowest-checkout"
  | "best-alternative";

export const ROLE_LABEL: Record<RecommendationRole, string> = {
  "best-verified": "Best verified stack",
  "lowest-checkout": "Lowest checkout price",
  "best-alternative": "Best alternative retailer",
};

export interface DealRecommendation {
  /** All roles this route earned (roles merge instead of duplicating a route). */
  roles: RecommendationRole[];
  merchantId: string;
  merchantName: string;
  /** The product listing that anchored the price, when one exists. */
  deal: PublicDeal | null;
  /** Listed price the stack was calculated on (null = example spend). */
  listedPrice: number | null;
  /** Engine output at the listed price (or the page spend), when available. */
  recommendation: StackRecommendation | null;
  facts: MerchantStackFacts | null;
  /** What the shopper hands over at checkout (listed price minus cash layers). */
  payAtCheckout: number;
  cashbackLater: number;
  verifiedSaving: number;
  totalSaving: number;
}

interface Candidate {
  merchantId: string;
  merchantName: string;
  deal: PublicDeal | null;
  listedPrice: number | null;
  recommendation: StackRecommendation | null;
}

/** True when this request expresses purchase intent worth recommending on. */
export function hasPurchaseIntent(params: DealsParams): boolean {
  return Boolean(params.q || params.cat || params.merchant);
}

function toRecommendation(
  candidate: Candidate,
  roles: RecommendationRole[],
): DealRecommendation {
  const rec = candidate.recommendation;
  const facts = rec ? (deriveMerchantFacts([rec]).get(rec.merchantId) ?? null) : null;
  return {
    roles,
    merchantId: candidate.merchantId,
    merchantName: candidate.merchantName,
    deal: candidate.deal,
    listedPrice: candidate.listedPrice,
    recommendation: rec,
    facts,
    payAtCheckout: rec?.payAtCheckout ?? candidate.listedPrice ?? 0,
    cashbackLater: rec?.cashbackLater ?? 0,
    verifiedSaving: rec?.verifiedSaving ?? 0,
    totalSaving: rec?.totalSaving ?? 0,
  };
}

/** Route key — one entry per merchant+product route after deduplication. */
function candidateKey(candidate: Candidate): string {
  return `${candidate.merchantId}|${candidate.deal?.productGroup ?? candidate.deal?.id ?? "-"}`;
}

function checkoutPriceOf(candidate: Candidate): number | null {
  if (candidate.listedPrice == null) return null;
  return candidate.recommendation?.payAtCheckout ?? candidate.listedPrice;
}

/** Prefer better-verified on ties: verified saving desc, then unverified reliance asc. */
function verifiedFirst(a: Candidate, b: Candidate): number {
  const verified =
    (b.recommendation?.verifiedSaving ?? 0) -
    (a.recommendation?.verifiedSaving ?? 0);
  if (verified !== 0) return verified;
  const reliesOnUnverified = (candidate: Candidate) =>
    candidate.recommendation
      ? Number(
          candidate.recommendation.components.some(
            (component) =>
              !component.optional &&
              component.layer !== "points" &&
              (component.valueDollars ?? 0) > 0 &&
              component.confidence !== "confirmed",
          ),
        )
      : 0;
  return reliesOnUnverified(a) - reliesOnUnverified(b);
}

/**
 * Build the recommendation strip from the already-matched deal pool.
 *
 * @param matched  Output of matchDeals() for this request.
 * @param stackRecommendations  Engine output at the page spend (bundle).
 * @param stackData  Injected engine data for listed-price recalculations.
 */
export function buildDealRecommendations(
  matched: PublicDeal[],
  stackRecommendations: StackRecommendation[],
  stackData: StackData,
  params: DealsParams,
  now: Date = new Date(),
): DealRecommendation[] {
  if (!hasPurchaseIntent(params)) return [];

  const recByMerchant = new Map(
    stackRecommendations.map((rec) => [rec.merchantId, rec]),
  );

  // Product-anchored candidates: a listing with a real price at a known
  // merchant. The engine reruns at the LISTED price so checkout figures are
  // about this purchase, not the generic example spend.
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const deal of matched) {
    if (deal.merchantId == null) continue;
    const anchored = deal.priceValue != null;
    const candidate: Candidate = {
      merchantId: deal.merchantId,
      merchantName: deal.merchantName ?? deal.merchantId,
      deal,
      listedPrice: deal.priceValue,
      recommendation: anchored
        ? (buildStackRecommendations(
            deal.merchantId,
            deal.priceValue!,
            stackData,
            now,
          )[0] ?? null)
        : (recByMerchant.get(deal.merchantId) ?? null),
    };
    // A route with neither a listed price nor any saving layer answers no
    // purchase question — the plain result list already covers it.
    if (candidate.recommendation == null && candidate.listedPrice == null) {
      continue;
    }
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  if (candidates.length === 0) return [];

  const roleOf = new Map<Candidate, RecommendationRole[]>();
  const assign = (candidate: Candidate | null, role: RecommendationRole) => {
    if (!candidate) return;
    roleOf.set(candidate, [...(roleOf.get(candidate) ?? []), role]);
  };

  // 1 — Best verified stack: highest confirmed cash saving.
  const bestVerified =
    [...candidates]
      .filter((candidate) => (candidate.recommendation?.verifiedSaving ?? 0) > 0)
      .sort(
        (a, b) =>
          verifiedFirst(a, b) ||
          (checkoutPriceOf(a) ?? Infinity) - (checkoutPriceOf(b) ?? Infinity) ||
          a.merchantName.localeCompare(b.merchantName),
      )[0] ?? null;
  assign(bestVerified, "best-verified");

  // 2 — Lowest checkout price among real product listings.
  const lowestCheckout =
    [...candidates]
      .filter((candidate) => checkoutPriceOf(candidate) != null)
      .sort(
        (a, b) =>
          checkoutPriceOf(a)! - checkoutPriceOf(b)! ||
          verifiedFirst(a, b) ||
          a.merchantName.localeCompare(b.merchantName),
      )[0] ?? null;
  assign(lowestCheckout, "lowest-checkout");

  // 3 — Best alternative from a merchant not already recommended. Only
  // meaningful when there is a primary recommendation to be an alternative TO.
  const usedMerchants = new Set(
    [...roleOf.keys()].map((candidate) => candidate.merchantId),
  );
  const bestAlternative =
    roleOf.size === 0
      ? null
      : ([...candidates]
          .filter((candidate) => !usedMerchants.has(candidate.merchantId))
          .sort(
            (a, b) =>
              verifiedFirst(a, b) ||
              (b.recommendation?.totalSaving ?? 0) -
                (a.recommendation?.totalSaving ?? 0) ||
              (checkoutPriceOf(a) ?? Infinity) -
                (checkoutPriceOf(b) ?? Infinity) ||
              a.merchantName.localeCompare(b.merchantName),
          )[0] ?? null);
  assign(bestAlternative, "best-alternative");

  const ROLE_ORDER: RecommendationRole[] = [
    "best-verified",
    "lowest-checkout",
    "best-alternative",
  ];
  return [...roleOf.entries()]
    .map(([candidate, roles]) => toRecommendation(candidate, roles))
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.roles[0]) - ROLE_ORDER.indexOf(b.roles[0]),
    )
    .slice(0, 3);
}
