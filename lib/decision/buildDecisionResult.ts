import type { DealsBundle } from "@/lib/deals/load";
import type {
  GiftCardAcceptanceRow,
  GiftCardOffer,
  GiftCardProduct,
  StackRecommendation,
} from "@/lib/offers/types";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { isConfirmedCurrentGiftCardOffer } from "@/lib/giftcards/publicQuery";
import {
  evaluateGiftCardCompatibility,
  GIFT_CARD_EXCLUSION_REASONS,
} from "@/lib/giftcards/compatibility";
import {
  ACCEPTANCE_EVIDENCE_RANK,
  ACCEPTANCE_STATUS_RANK,
  acceptanceEvidenceLabel,
  canonicalAcceptanceStatus,
  deriveAcceptanceFreshness,
  isCurrentlyAccepted,
  isPositiveAcceptance,
} from "@/lib/giftcards/acceptanceModel";
import { resolveMerchantAlias } from "@/lib/giftcards/resolveMerchantAlias";
import { buildWorkedExample } from "@/lib/giftcards/value";
import { giftCardDateState } from "@/lib/giftcards/dateState";
import type { Citation } from "@/lib/sources/types";
import { summariseCitations } from "@/lib/stack/citationSummary";
import type {
  SmartStackComparison,
  SmartStackResult,
} from "@/lib/stack/smartStack";
import type {
  DecisionResult,
  DecisionTarget,
  RetailerGiftCardOption,
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

const COMPATIBILITY_RANK = {
  incompatible: 0,
  "insufficient-evidence": 1,
  "requires-verification": 2,
  "likely-compatible": 3,
  compatible: 4,
} as const;

/** Exact TASK-11 ordering with a stable offer-id tie-breaker. */
export function compareRetailerGiftCardOptions(
  a: RetailerGiftCardOption,
  b: RetailerGiftCardOption,
): number {
  const evidence = (option: RetailerGiftCardOption) =>
    option.acceptance?.evidenceSourceType
      ? ACCEPTANCE_EVIDENCE_RANK[option.acceptance.evidenceSourceType]
      : 0;
  const status = (option: RetailerGiftCardOption) =>
    option.acceptance
      ? ACCEPTANCE_STATUS_RANK[canonicalAcceptanceStatus(option.acceptance)]
      : 0;
  const freshness = (option: RetailerGiftCardOption) =>
    option.evidenceFreshness === "current"
      ? 2
      : option.evidenceFreshness === "not-checked"
        ? 1
        : 0;
  const limits = (option: RetailerGiftCardOption) =>
    (option.offer.capDollars != null ? 1 : 0) +
    (option.offer.usesPerCustomer != null ? 1 : 0);
  return (
    Number(b.activeApproved) - Number(a.activeApproved) ||
    evidence(b) - evidence(a) ||
    status(b) - status(a) ||
    freshness(b) - freshness(a) ||
    Number(b.directApplicability) - Number(a.directApplicability) ||
    COMPATIBILITY_RANK[b.compatibilityStatus] -
      COMPATIBILITY_RANK[a.compatibilityStatus] ||
    b.immediateCashSaving - a.immediateCashSaving ||
    ((b.estimatedRewardsValue ?? 0) + (b.futureCreditValue ?? 0)) -
      ((a.estimatedRewardsValue ?? 0) + (a.futureCreditValue ?? 0)) ||
    a.purchaseFriction - b.purchaseFriction ||
    limits(a) - limits(b) ||
    a.offer.id.localeCompare(b.offer.id, "en-AU")
  );
}

function acceptanceChannels(row: GiftCardAcceptanceRow | null): string[] {
  if (!row) return [];
  return [
    row.acceptsOnline === true ? "Online" : null,
    row.acceptsInStore === true ? "In store" : null,
    row.acceptsApp === true ? "App" : null,
    row.acceptsPhone === true ? "Phone" : null,
  ].filter((value): value is string => value != null);
}

function bestAcceptance(
  rows: GiftCardAcceptanceRow[],
  now: Date,
): GiftCardAcceptanceRow | null {
  return [...rows].sort((a, b) => {
    const current =
      Number(isCurrentlyAccepted(b, now)) - Number(isCurrentlyAccepted(a, now));
    const evidence =
      (b.evidenceSourceType ? ACCEPTANCE_EVIDENCE_RANK[b.evidenceSourceType] : 0) -
      (a.evidenceSourceType ? ACCEPTANCE_EVIDENCE_RANK[a.evidenceSourceType] : 0);
    return current || evidence || a.id.localeCompare(b.id, "en-AU");
  })[0] ?? null;
}

function retailerGiftCardPlans(
  selectedStoreId: string | null,
  spend: number,
  inputs: DecisionInputs,
  now: Date,
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

  // One plan per merchant: the same card list repeated per product option is
  // pure noise. Prefer the selected-store context (user's spend), then the
  // first context with a listed price.
  const byMerchant = new Map<string, (typeof contexts)[number]>();
  for (const context of contexts) {
    const existing = byMerchant.get(context.merchantId);
    if (!existing) {
      byMerchant.set(context.merchantId, context);
      continue;
    }
    const rank = (c: (typeof contexts)[number]) =>
      c.key.startsWith("store:") ? 2 : c.listedPrice != null ? 1 : 0;
    if (rank(context) > rank(existing)) {
      byMerchant.set(context.merchantId, context);
    }
  }
  return [...byMerchant.values()].map(
    (context) => {
      const faceValue = context.listedPrice ?? spend;
      const componentByOffer = new Map(
        (context.recommendation?.components ?? [])
          .filter((component) => component.sourceOfferId)
          .map((component) => [component.sourceOfferId!, component]),
      );
      const productById = new Map(inputs.products.map((product) => [product.id, product]));
      const merchantAcceptance = inputs.acceptance.filter(
        (row) =>
          row.storeId === context.merchantId ||
          normalise(row.merchantName ?? "") === normalise(context.merchantName),
      );
      const relevantProductIds = new Set(
        merchantAcceptance.filter(isPositiveAcceptance).map((row) => row.productId),
      );
      const allOptions = inputs.giftCardOffers
        .filter((offer) => {
          const ids = [offer.productId, ...(offer.includedProductIds ?? [])].filter(
            (id): id is string => Boolean(id),
          );
          return (
            offer.acceptedAtMerchantIds.includes(context.merchantId) ||
            ids.some((id) => relevantProductIds.has(id))
          );
        })
        .flatMap((offer) => {
          const offerProductIds = [
            offer.productId,
            ...(offer.includedProductIds ?? []),
          ].filter((id): id is string => Boolean(id));
          const acceptance = bestAcceptance(
            merchantAcceptance.filter((row) => offerProductIds.includes(row.productId)),
            now,
          );
          const product =
            offerProductIds.map((id) => productById.get(id)).find(Boolean) ?? null;
          const activeApproved = isConfirmedCurrentGiftCardOffer(offer, now);
          const compatibility = evaluateGiftCardCompatibility(offer, {
            now,
            storeId: context.merchantId,
            storeName: context.merchantName,
            acceptance,
            product,
            purchaseAmount: faceValue,
          });
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
          const freshness = acceptance
            ? deriveAcceptanceFreshness(acceptance, now)
            : "not-checked";
          const stale = freshness === "stale";
          const inactiveAcceptance =
            acceptance != null && !isCurrentlyAccepted(acceptance, now);
          const excluded =
            !activeApproved ||
            inactiveAcceptance ||
            compatibility.status === "incompatible";
          const dateState = giftCardDateState(offer, now);
          const exclusionReason = !activeApproved
            ? dateState === "expired" && offer.expiryDate
              ? GIFT_CARD_EXCLUSION_REASONS.expired(offer.expiryDate)
              : dateState === "future" && offer.startDate
                ? GIFT_CARD_EXCLUSION_REASONS.upcoming(offer.startDate)
                : "The offer is not confirmed as currently active."
            : stale
              ? GIFT_CARD_EXCLUSION_REASONS.staleAcceptance
              : inactiveAcceptance
                ? GIFT_CARD_EXCLUSION_REASONS.inactiveAcceptance
              : compatibility.status === "incompatible"
                ? compatibility.reason
                : null;
          const purchaseFriction =
            Number(Boolean(offer.membershipRequired)) +
            Number(Boolean(offer.activationRequired)) +
            Number(Boolean(offer.couponRequired));
          return [{
            offer,
            product,
            acceptance,
            role: component
              ? component.optional
                ? ("alternative" as const)
                : ("included" as const)
              : ("available" as const),
            activeApproved,
            directApplicability: acceptance?.storeId === context.merchantId,
            excluded,
            exclusionReason,
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
            futureCreditValue: worked.futureCreditDollars,
            redemptionChannels: acceptanceChannels(acceptance),
            evidenceLabel: acceptance
              ? acceptanceEvidenceLabel(acceptance)
              : "Acceptance requires verification",
            evidenceFreshness: freshness,
            maxUsableAmount: offer.capDollars ?? null,
            perCardMaximum: product?.maxDenomination ?? null,
            estimatedCardCount:
              product?.maxDenomination && product.maxDenomination > 0
                ? Math.ceil(worked.coveredFaceValue / product.maxDenomination)
                : null,
            denominationRequirement:
              offer.denominationNote ??
              (product?.denominations?.length
                ? `Known denominations: ${product.denominations
                    .map((value) => `$${value}`)
                    .join(", ")}`
                : product?.variableLoad &&
                    product.minDenomination != null &&
                    product.maxDenomination != null
                  ? `Variable load $${product.minDenomination}–$${product.maxDenomination} per card`
                  : null),
            purchaseFriction,
            orderedSteps: [
              ...(offer.membershipRequired ? ["Confirm membership eligibility"] : []),
              ...(offer.activationRequired ? ["Activate the offer"] : []),
              product?.maxDenomination && worked.coveredFaceValue > product.maxDenomination
                ? `Buy at least ${Math.ceil(worked.coveredFaceValue / product.maxDenomination)} gift cards from the reviewed seller`
                : "Buy the gift card from the reviewed seller",
              `Redeem it at ${context.merchantName}`,
            ],
          }];
        })
        .sort(compareRetailerGiftCardOptions);
      return {
        merchantId: context.merchantId,
        merchantName: context.merchantName,
        productTitle: context.productTitle,
        listedPrice: context.listedPrice,
        giftCardOptions: allOptions.filter((option) => !option.excluded),
        excludedGiftCardOptions: allOptions.filter((option) => option.excluded),
      };
    },
  );
}

export function buildDecisionResult(
  query: string,
  spend: number,
  inputs: DecisionInputs,
  now: Date = new Date(),
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
  const merchantResolution = q ? resolveMerchantAlias(q, bundle.stores) : null;
  const resolvedStore = merchantResolution?.storeId
    ? bundle.stores.find((store) => store.id === merchantResolution.storeId) ?? null
    : null;
  // Only surface a correction when a typo-tolerant near-match (not an exact hit)
  // landed the query on a store — so the user sees "showing results for X".
  const queryCorrection =
    resolvedStore && merchantResolution?.method === "near-match"
      ? { searched: q, resolvedName: resolvedStore.name }
      : null;
  const selectedTarget = q
    ? (resolvedStore
      ? {
          kind: "store" as const,
          id: resolvedStore.id,
          name: resolvedStore.name,
          description: resolvedStore.category,
        }
      : exactTarget(allTargets, q) ??
      (allTargets.length === 1 ? allTargets[0] : null))
    : null;
  const ambiguous =
    q.length > 0 &&
    (merchantResolution?.state === "ambiguous" ||
      (allTargets.length > 1 && selectedTarget === null));

  const selectedStoreId =
    selectedTarget?.kind === "store" ? selectedTarget.id : null;
  const candidateStacks = !q || ambiguous
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
    if (!q || !isConfirmedCurrentGiftCardOffer(offer, now)) return false;
    if (selectedStoreId) {
      const currentProductIds = new Set(
        acceptance
          .filter(
            (row) =>
              row.storeId === selectedStoreId && isCurrentlyAccepted(row, now),
          )
          .map((row) => row.productId),
      );
      return (
        offer.acceptedAtMerchantIds.includes(selectedStoreId) ||
        [offer.productId, ...(offer.includedProductIds ?? [])].some(
          (id) => id != null && currentProductIds.has(id),
        )
      );
    }
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
  const retailerPlans = ambiguous
    ? []
    : retailerGiftCardPlans(selectedStoreId, safeSpend, inputs, now);
  const productById = new Map(products.map((product) => [product.id, product]));
  const acceptedCards = acceptance.flatMap((row) => {
    if (!q) return [];
    if (!isCurrentlyAccepted(row, now)) return [];
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
    queryCorrection,
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
