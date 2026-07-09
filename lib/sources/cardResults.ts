import type { CardOffer } from "@/lib/offers/types";
import type { DealSourceResult } from "./types";

/**
 * Pure mapper: bank/credit-card offers → DealSourceResult ("card" kind).
 *
 * Only imports types (CardOffer + DealSourceResult) — no supabase, no repos —
 * so both the DB path (lib/repos/sourceResults.ts) and the static demo path
 * (lib/sources/manualData.ts) can share it, and it's unit-testable with zero
 * setup.
 */

/** Only the fields the mapper reads — DB row mappers can build this directly
 * without filling unrelated columns (minimumSpend etc.) with fake nulls. */
export type CardOfferSourceInput = Pick<
  CardOffer,
  | "id"
  | "provider"
  | "cardName"
  | "bonusPoints"
  | "cashbackAmount"
  | "statementCreditAmount"
  | "offerSummary"
  | "sourceUrl"
  | "expiryDate"
  | "lastCheckedAt"
  | "confidence"
>;

/** Human headline for a card offer, by bonus shape. */
export function cardOfferHeadline(o: CardOfferSourceInput): string {
  if (o.bonusPoints) return `${o.bonusPoints.toLocaleString("en-AU")} bonus points`;
  if (o.cashbackAmount) return `$${o.cashbackAmount} cashback`;
  if (o.statementCreditAmount) return `$${o.statementCreditAmount} statement credit`;
  return "Card offer";
}

export function cardOfferToSourceResult(o: CardOfferSourceInput): DealSourceResult {
  return {
    id: `card:${o.id}`,
    source: "manual", // admin-verified entry → "DealStack verified"
    kind: "card",
    title: `${o.provider} ${o.cardName} — ${cardOfferHeadline(o)}`,
    merchant: null,
    merchantId: null, // product comparison, not merchant-stacking
    summary: o.offerSummary,
    discountPercent: null,
    pointsProgram: null,
    pointsAmount: cardOfferHeadline(o), // drives the card's headline slot
    giftCardBrand: null,
    cardOrProvider: o.provider, // already part of the search haystack
    expiryDate: o.expiryDate,
    startDate: null,
    sourceUrl: o.sourceUrl,
    publishedAt: null,
    lastCheckedAt: o.lastCheckedAt,
    confidence: o.confidence,
  };
}
