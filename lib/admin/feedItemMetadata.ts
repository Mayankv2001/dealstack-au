import { stores } from "@/lib/data";
import { findMerchantIdInText } from "@/lib/sources/normalise";
import type { DealKind } from "@/lib/sources/types";
import { detectFeedItemBrands } from "@/lib/admin/feedItemBrand";

export type CashbackProviderFilter = "ShopBack" | "TopCashback";

export interface FeedItemMetadata {
  brands: string[];
  merchantId: string | null;
  merchantName: string | null;
  dealKind: DealKind;
  priceText: string | null;
  discountText: string | null;
  discountValue: number | null;
  cashbackProvider: CashbackProviderFilter | null;
  cashbackText: string | null;
  couponCode: string | null;
  expiryDate: string | null;
  score: number | null;
}

const STORE_NAME = new Map(stores.map((store) => [store.id, store.name]));

function finitePositive(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

function extractProductPrice(title: string): string | null {
  const matches = [...title.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)];
  for (const match of matches) {
    const start = match.index ?? 0;
    const before = title.slice(Math.max(0, start - 18), start).toLowerCase();
    const after = title.slice(start + match[0].length, start + match[0].length + 18).toLowerCase();
    if (/spend\s*$|min(?:imum)?\s*$/.test(before)) continue;
    if (
      /^\s*(?:off|cash\s*back|cashback|back|bonus|credit|saving|\+?\s*spend)/.test(
        after
      )
    ) {
      continue;
    }
    return `$${match[1]}`;
  }
  return null;
}

/** Conservative extraction only: unknown values remain null for human review. */
export function deriveFeedItemMetadata(item: {
  rawTitle: string;
  rawSummary: string;
  categories: string[];
}): FeedItemMetadata {
  const text = `${item.rawTitle} ${item.rawSummary}`;
  const lower = text.toLowerCase();
  const merchantId = findMerchantIdInText(item.rawTitle);

  const cashbackProvider = /topcashback/i.test(text)
    ? "TopCashback"
    : /shopback/i.test(text)
      ? "ShopBack"
      : null;
  const cashbackMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*cash\s*back/i);
  const percentOff = text.match(/(\d+(?:\.\d+)?)\s*%\s*off\b/i);
  const dollarsOff = text.match(/(?:\$\s*([\d,.]+)\s*off\b|save\s*\$\s*([\d,.]+))/i);
  const scoreMatch = text.match(/\b(\d{1,6})\s*(?:votes?|score)\b/i);
  const couponMatch = text.match(
    /\b(?:with\s+)?(?:code|coupon)\s*[:\-]?\s*([a-z0-9][a-z0-9-]{2,20})\b/i
  );
  const isoExpiry = text.match(
    /\b(?:ends?|expires?|expiry)\s*(?:on|:|-)?\s*(20\d{2}-\d{2}-\d{2})\b/i
  );

  const cashbackRate = finitePositive(cashbackMatch?.[1]);
  const percentDiscount = finitePositive(percentOff?.[1]);
  const dollarDiscount = finitePositive(dollarsOff?.[1] ?? dollarsOff?.[2]);
  const discountValue = percentDiscount ?? dollarDiscount;
  const discountText = percentDiscount
    ? `${percentDiscount}% off`
    : dollarDiscount
      ? `$${dollarDiscount.toLocaleString("en-AU")} off`
      : null;
  const cashbackText = cashbackRate ? `${cashbackRate}% cashback` : null;

  let dealKind: DealKind = "discount-code";
  const categoryText = item.categories.join(" ").toLowerCase();
  if (/gift\s*card/.test(lower) || /gift\s*card/.test(categoryText)) {
    dealKind = "gift-card";
  } else if (cashbackProvider || /cash\s*back/.test(lower)) {
    dealKind = "cashback";
  } else if (/points|qantas|velocity|flybuys|everyday rewards|frequent flyer/.test(lower)) {
    dealKind = "points";
  } else if (/\bguide\b|how to|explained|comparison/.test(lower)) {
    dealKind = "guide";
  }

  return {
    brands: detectFeedItemBrands(item.categories),
    merchantId,
    merchantName: merchantId ? STORE_NAME.get(merchantId) ?? null : null,
    dealKind,
    priceText: extractProductPrice(item.rawTitle),
    discountText,
    discountValue,
    cashbackProvider,
    cashbackText,
    couponCode: couponMatch?.[1]?.toUpperCase() ?? null,
    expiryDate: validIsoDate(isoExpiry?.[1]),
    score: finitePositive(scoreMatch?.[1]),
  };
}
