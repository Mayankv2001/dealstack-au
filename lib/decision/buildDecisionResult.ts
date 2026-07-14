import type { DealsBundle } from "@/lib/deals/load";
import type {
  GiftCardAcceptanceRow,
  GiftCardOffer,
  GiftCardProduct,
  StackRecommendation,
} from "@/lib/offers/types";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { isConfirmedCurrentGiftCardOffer } from "@/lib/giftcards/publicQuery";
import { evaluateGiftCardCompatibility } from "@/lib/giftcards/compatibility";
import { buildWorkedExample } from "@/lib/giftcards/value";
import type { Citation } from "@/lib/sources/types";
import { summariseCitations } from "@/lib/stack/citationSummary";
import type {
  SmartStackComparison,
  SmartStackResult,
} from "@/lib/stack/smartStack";
import type {
  DecisionResult,
  DecisionTarget,
  RetailerGiftCardPlan,
} from "./types";

export interface DecisionInputs {
  bundle: DealsBundle;
  products: GiftCardProduct[];
  acceptance: GiftCardAcceptanceRow[];
  /** Already-public offers from the same anon/RLS-backed stack-data load. */
  giftCardOffers: GiftCardOffer[];
  productComparisons?: SmartStackComparison[];
  /** All approved product matches, including single-retailer results. */
  productMatches?: SmartStackResult[];
}

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function matches(value: string, query: string): boolean {
  const haystack = normalise(value);
  return normalise(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function offerSearchText(offer: GiftCardOffer): string {
  return [
    offer.brand,
    offer.source,
    offer.sourceName,
    offer.pointsProgram,
    offer.pointsOnPurchase?.program,
    offer.promotionType,
    ...(offer.acceptedAt ?? []),
    ...offer.acceptedAtMerchantIds,
  ]
    .filter(Boolean)
    .join(" ");
}

function uniqueTargets(targets: DecisionTarget[]): DecisionTarget[] {
  return [
    ...new Map(
      targets.map((target) => [`${target.kind}:${target.id}`, target]),
    ).values(),
  ];
}

function exactTarget(
  targets: DecisionTarget[],
  query: string,
): DecisionTarget | null {
  const needle = normalise(query);
  const exact = targets.filter(
    (target) =>
      normalise(target.name) === needle || normalise(target.id) === needle,
  );
  return exact.length === 1 ? exact[0] : null;
}

function citationsFor(
  stacks: Array<StackRecommendation | null>,
  offers: GiftCardOffer[],
): Citation[] {
  return [
    ...stacks.flatMap((stack) => stack?.citations ?? []),
    ...offers.flatMap((offer) => offer.citations),
  ];
}

function retailerGiftCardPlans(
  selectedStoreId: string | null,
  spend: number,
  inputs: DecisionInputs,
): RetailerGiftCardPlan[] {
  const contexts: Array<{
    key: string;
    merchantId: string;
    merchantName: string;
    productTitle: string | null;
    listedPrice: number | null;
    recommendation: StackRecommendation | null;
  }> = [];
  if (selectedStoreId) {
    const store = inputs.bundle.stores.find((item) => item.id === selectedStoreId);
    if (store) {
      contexts.push({
        key: `store:${store.id}`,
        merchantId: store.id,
        merchantName: store.name,
        productTitle: null,
        listedPrice: spend,
        recommendation:
          inputs.bundle.stackRecommendations.find(
            (item) => item.merchantId === store.id,
          ) ?? null,
      });
    }
  }
  for (const comparison of inputs.productComparisons ?? []) {
    for (const option of comparison.options) {
      const merchantId =
        option.recommendation?.merchantId ?? option.signal.merchantId;
      if (!merchantId) continue;
      const store = inputs.bundle.stores.find((item) => item.id === merchantId);
      contexts.push({
        key: `${comparison.productGroup}:${merchantId}`,
        merchantId,
        merchantName:
          option.recommendation?.merchantName ?? store?.name ?? "Retailer",
        productTitle: comparison.title,
        listedPrice: option.signalPrice,
        recommendation: option.recommendation,
      });
    }
  }
  for (const option of inputs.productMatches ?? []) {
    const merchantId = option.recommendation?.merchantId ?? option.signal.merchantId;
    if (!merchantId) continue;
    const store = inputs.bundle.stores.find((item) => item.id === merchantId);
    contexts.push({
      key: `${option.signal.productGroup ?? option.signal.id}:${merchantId}`,
      merchantId,
      merchantName:
        option.recommendation?.merchantName ?? store?.name ?? "Retailer",
      productTitle: option.signal.title,
      listedPrice: option.signalPrice,
      recommendation: option.recommendation,
    });
  }

  return [...new Map(contexts.map((context) => [context.key, context])).values()].map(
    (context) => {
      const faceValue = context.listedPrice ?? spend;
      const componentByOffer = new Map(
        (context.recommendation?.components ?? [])
          .filter((component) => component.sourceOfferId)
          .map((component) => [component.sourceOfferId!, component]),
      );
      const giftCardOptions = inputs.giftCardOffers
        .filter(
          (offer) =>
            isConfirmedCurrentGiftCardOffer(offer) &&
            offer.acceptedAtMerchantIds.includes(context.merchantId),
        )
        .flatMap((offer) => {
          const compatibility = evaluateGiftCardCompatibility(offer, {
            storeId: context.merchantId,
            storeName: context.merchantName,
          });
          if (compatibility.status === "incompatible") return [];
          const worked = buildWorkedExample(
            {
              promotionType: offer.promotionType ?? "discount",
              discountPercent: offer.discountPercent || null,
              bonusPercent: offer.bonusPercent ?? null,
              pointsMultiplier: offer.pointsMultiplier ?? null,
              fixedPoints: offer.fixedPoints ?? null,
              pointsProgram:
                offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null,
              pointsValueCents: offer.pointsValueCents ?? null,
              fixedDiscountDollars: offer.fixedDiscountDollars ?? null,
              promoCreditDollars: offer.promoCreditDollars ?? null,
              feeWaiverDollars: offer.feeWaiverDollars ?? null,
              thresholdDollars: offer.thresholdDollars ?? null,
              capDollars: offer.capDollars,
            },
            faceValue,
          );
          if (!worked) return [];
          const component = componentByOffer.get(offer.id);
          return [{
            offer,
            role: component
              ? component.optional
                ? ("alternative" as const)
                : ("included" as const)
              : ("available" as const),
            compatibilityStatus:
              component?.compatibilityStatus ?? compatibility.status,
            compatibilityReason:
              component?.compatibilityReason ?? compatibility.reason,
            engineNote: component?.note ?? null,
            warnings: [
              ...new Set([
                ...compatibility.warnings,
                ...(component?.compatibilityWarnings ?? []),
              ]),
            ],
            coveredGiftCardValue: worked.coveredFaceValue,
            cashPaid: worked.cashPaid,
            immediateCashSaving: worked.acquisitionSaving,
            bonusCardValue: worked.bonusValueDollars,
            pointsEarned: worked.points,
            estimatedRewardsValue: worked.rewardValueDollars,
          }];
        })
        .sort((a, b) => {
          const role = { included: 0, alternative: 1, available: 2 } as const;
          return (
            role[a.role] - role[b.role] ||
            b.immediateCashSaving - a.immediateCashSaving ||
            (b.estimatedRewardsValue ?? 0) - (a.estimatedRewardsValue ?? 0)
          );
        });
      return {
        merchantId: context.merchantId,
        merchantName: context.merchantName,
        productTitle: context.productTitle,
        listedPrice: context.listedPrice,
        giftCardOptions,
      };
    },
  );
}

export function buildDecisionResult(
  query: string,
  spend: number,
  inputs: DecisionInputs,
): DecisionResult {
  const q = query.trim();
  const { bundle, products, acceptance } = inputs;
  const safeSpend = Number.isFinite(spend) && spend > 0 ? spend : 500;

  const storeTargets = bundle.stores
    .filter(
      (store) =>
        !q || matches(`${store.name} ${store.category} ${store.id}`, q),
    )
    .map<DecisionTarget>((store) => ({
      kind: "store",
      id: store.id,
      name: store.name,
      description: store.category,
    }));

  const productTargets = products
    .filter(
      (product) =>
        !q ||
        matches(`${product.brand} ${product.slug} ${product.issuer ?? ""}`, q),
    )
    .map<DecisionTarget>((product) => ({
      kind: "gift-card",
      id: product.id,
      name: product.brand,
      description: `${product.format.replaceAll("-", " ")} gift card`,
    }));
  const offerBrandTargets = bundle.deals
    .filter(
      (deal) =>
        deal.kind === "gift-card" && (!q || matches(deal.searchText, q)),
    )
    .map<DecisionTarget>((deal) => ({
      kind: "gift-card",
      id: deal.id.replace(/^gift-card:/, ""),
      name: deal.title
        .replace(/^(?:\d+(?:\.\d+)?% off )/i, "")
        .replace(/ gift cards?.*$/i, ""),
      description: "Current reviewed gift-card offer",
    }));

  const programmeTargets = REWARDS_PROGRAMMES.filter(
    (programme) => !q || matches(`${programme.name} ${programme.shortName}`, q),
  ).map<DecisionTarget>((programme) => ({
    kind: "programme",
    id: programme.slug,
    name: programme.name,
    description: "Rewards programme",
  }));

  const giftCardTargets = uniqueTargets([
    ...productTargets,
    ...offerBrandTargets,
  ]);
  const allTargets = [...storeTargets, ...giftCardTargets, ...programmeTargets];
  const selectedTarget = q
    ? (exactTarget(allTargets, q) ??
      (allTargets.length === 1 ? allTargets[0] : null))
    : null;
  const ambiguous =
    q.length > 0 && allTargets.length > 1 && selectedTarget === null;

  const selectedStoreId =
    selectedTarget?.kind === "store" ? selectedTarget.id : null;
  const candidateStacks = !q
    ? []
    : selectedStoreId
      ? bundle.stackRecommendations.filter(
          (stack) => stack.merchantId === selectedStoreId,
        )
      : bundle.stackRecommendations.filter((stack) =>
          matches(`${stack.merchantName} ${stack.title}`, q),
        );
  const bestCashStack =
    candidateStacks.find((stack) => stack.kind === "cash") ?? null;
  const rewardsStack =
    candidateStacks.find((stack) => stack.kind === "points-only") ??
    candidateStacks.find((stack) => stack.pointsEarned > 0) ??
    null;

  const selectedProductIds = new Set(
    selectedTarget?.kind === "gift-card"
      ? products
          .filter(
            (product) =>
              product.id === selectedTarget.id ||
              normalise(product.brand) === normalise(selectedTarget.name),
          )
          .map((product) => product.id)
      : [],
  );
  const selectedProgramme =
    selectedTarget?.kind === "programme" ? selectedTarget.name : null;
  const filteredOffers = inputs.giftCardOffers.filter((offer) => {
    if (!q || !isConfirmedCurrentGiftCardOffer(offer)) return false;
    if (selectedStoreId)
      return offer.acceptedAtMerchantIds.includes(selectedStoreId);
    if (selectedProductIds.size > 0) {
      return [offer.productId, ...(offer.includedProductIds ?? [])].some(
        (id) => id != null && selectedProductIds.has(id),
      );
    }
    if (selectedProgramme) {
      return matches(
        `${offer.pointsProgram ?? ""} ${offer.pointsOnPurchase?.program ?? ""}`,
        selectedProgramme,
      );
    }
    return !q || matches(offerSearchText(offer), q);
  });
  const retailerPlans = retailerGiftCardPlans(
    selectedStoreId,
    safeSpend,
    inputs,
  );
  const productById = new Map(products.map((product) => [product.id, product]));
  const acceptedCards = acceptance.flatMap((row) => {
    if (!q) return [];
    const product = productById.get(row.productId);
    if (!product) return [];
    if (selectedStoreId && row.storeId !== selectedStoreId) return [];
    if (selectedProductIds.size > 0 && !selectedProductIds.has(row.productId))
      return [];
    if (!selectedStoreId && selectedProductIds.size === 0 && q) {
      if (
        !matches(
          `${product.brand} ${row.merchantName ?? ""} ${row.merchantCategory ?? ""}`,
          q,
        )
      ) {
        return [];
      }
    }
    return [{ product, acceptance: row }];
  });

  const communityPulse = bundle.deals
    .filter(
      (deal) =>
        q.length > 0 &&
        deal.kind === "community" &&
        deal.sourceUrl != null &&
        (selectedStoreId
          ? deal.merchantId === selectedStoreId
          : !q || matches(deal.searchText, q)),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const alternativeStacks = bundle.stackRecommendations
    .filter((stack) => stack !== bestCashStack && stack !== rewardsStack)
    .filter(
      (stack) =>
        q.length > 0 && matches(`${stack.merchantName} ${stack.title}`, q),
    )
    .slice(0, 3);
  const warnings = [
    ...new Set([
      ...(bestCashStack?.warnings.map((warning) => warning.message) ?? []),
      ...(rewardsStack?.warnings.map((warning) => warning.message) ?? []),
    ]),
  ];
  const citations = citationsFor([bestCashStack, rewardsStack], filteredOffers);
  const citationSummary = summariseCitations(citations, 0);
  const publisherFamilies = new Set(
    citationSummary.providers
      .filter(
        (provider) =>
          provider.evidenceLinkCount > 0 &&
          provider.publisherFamily !== "dealstack",
      )
      .map((provider) => provider.publisherFamily),
  );
  communityPulse.forEach((deal) => publisherFamilies.add(deal.publisherFamily));
  const checkedDates = [
    bestCashStack?.checkedAsOf,
    rewardsStack?.checkedAsOf,
    ...filteredOffers.map((offer) => offer.lastCheckedAt),
    ...communityPulse.map((deal) => deal.capturedAt),
  ].filter((value): value is string => Boolean(value));

  return {
    query: q,
    spend: safeSpend,
    targetGroups: {
      stores: storeTargets,
      giftCards: giftCardTargets,
      programmes: programmeTargets,
    },
    selectedTarget,
    ambiguous,
    stores: bundle.stores,
    productComparisons: inputs.productComparisons ?? [],
    bestCashStack,
    rewardsStack,
    currentGiftCardOffers: filteredOffers,
    retailerGiftCardPlans: retailerPlans,
    acceptedCards,
    alternativeStacks,
    communityPulse,
    warnings,
    freshness: {
      sourceFamilyCount: publisherFamilies.size,
      sourceLinkCount: citationSummary.linkCount + communityPulse.length,
      oldestVerificationDate: checkedDates.length
        ? [...checkedDates].sort()[0]
        : null,
    },
    rankingExplanation: [
      "Immediate verified cash value",
      "Acquisition and redemption compatibility",
      "Source verification and freshness",
      "Eligibility, activation, caps and expiry",
      "Community heat only as a final tie-breaker",
    ],
    partial: bundle.partial,
  };
}
