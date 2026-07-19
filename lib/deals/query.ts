import { isExpiringSoonAU, isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { isPubliclyFresh, publicFreshness } from "@/lib/freshness";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";
import { daysSince } from "./score";
import {
  CATEGORY_KEYWORDS,
  PAGE_SIZE,
  PROGRAM_MATCH,
  VIEW_KIND,
  type DealsParams,
} from "./params";
import type { DealGroup, DealListItem, PublicDeal } from "./types";

/**
 * The pure /deals query engine: search → filter → dedupe/group → sort →
 * paginate, all server-side over the normalised pool. No I/O — fully
 * deterministic for a given `now`, so every behaviour is unit-testable.
 */

export interface DealsQueryResult {
  items: DealListItem[];
  /** Total matching items across all pages (after grouping). */
  total: number;
  page: number;
  pageCount: number;
}

function matchesSearch(deal: PublicDeal, q: string): boolean {
  if (!q) return true;
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((token) => deal.searchText.includes(token));
}

function matchesFilters(
  deal: PublicDeal,
  params: DealsParams,
  now: Date,
): boolean {
  const kind = params.kind ?? VIEW_KIND[params.view];
  if (kind && deal.kind !== kind) return false;
  if (params.view === "expiring" && !isExpiringSoonAU(deal.expiryDate, now)) {
    return false;
  }
  if (
    (params.view === "top" || params.trust === "verified") &&
    !isStrictlyVerifiedDeal(deal, now)
  ) {
    return false;
  }
  if (params.merchant && deal.merchantId !== params.merchant) return false;
  if (params.cat) {
    const keywords = CATEGORY_KEYWORDS[params.cat];
    if (!keywords.some((keyword) => deal.searchText.includes(keyword))) {
      return false;
    }
  }
  if (
    params.maxPrice != null &&
    (deal.priceValue == null || deal.priceValue > params.maxPrice)
  ) {
    return false;
  }
  if (
    params.program &&
    !deal.searchText.includes(PROGRAM_MATCH[params.program])
  ) {
    return false;
  }
  if (params.trust && deal.trust !== params.trust) return false;
  if (params.coupon && !deal.couponCode) return false;
  if (params.stackable && !deal.stackable) return false;
  if (params.membership && !deal.membershipRequired) return false;
  if (params.activation && !deal.activationRequired) return false;
  if (params.targeted && !deal.targeted) return false;
  if (params.channel) {
    const channel = deal.channelNote?.toLowerCase() ?? "";
    if (params.channel === "online" && !channel.includes("online")) return false;
    if (params.channel === "in-store" && !channel.includes("in-store")) {
      return false;
    }
  }
  if (
    params.minSaving != null &&
    (deal.savingPercent == null || deal.savingPercent < params.minSaving)
  ) {
    return false;
  }
  if (params.ending) {
    if (!deal.expiryDate) return false;
    const today = Date.parse(`${todayAU(now)}T00:00:00Z`);
    const expiry = Date.parse(`${deal.expiryDate}T00:00:00Z`);
    if (Number.isNaN(expiry)) return false;
    const days = Math.floor((expiry - today) / 86_400_000);
    const limit = params.ending === "72h" ? 3 : 7;
    if (days < 0 || days > limit) return false;
  }
  if (params.added) {
    const age = daysSince(deal.postedAt, now);
    if (age == null) return false;
    if (params.added === "today" && age > 0) return false;
    if (params.added === "week" && age > 7) return false;
  }
  return true;
}

/**
 * Strict public eligibility for the “Best verified” promise. A source-confirmed
 * record is not enough: DealStack verification, current dates, recent checking
 * and a meaningful evidence destination are all required.
 */
export function isStrictlyVerifiedDeal(deal: PublicDeal, now: Date): boolean {
  return (
    deal.trust === "verified" &&
    deal.dealStackVerified === true &&
    deal.dateStatus === "confirmed-current" &&
    !isPastExpiry(deal.expiryDate, todayAU(now)) &&
    isPubliclyFresh(deal.lastCheckedAt, now) &&
    safePublicSourceUrl(deal.sourceUrl ?? "") !== null
  );
}

/** Live = not past expiry and not marked expired. The public default. */
export function filterActive(deals: PublicDeal[], now: Date): PublicDeal[] {
  const today = todayAU(now);
  return deals.filter(
    (deal) => deal.trust !== "expired" && !isPastExpiry(deal.expiryDate, today),
  );
}

/** Same-offer key: two records of one deal at one merchant collapse to one. */
function dedupeKey(deal: PublicDeal): string {
  if (deal.sourceNativeId) return `native|${deal.kind}|${deal.sourceNativeId}`;
  const title = deal.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return [
    deal.kind,
    deal.merchantId ?? "-",
    title,
    deal.priceValue ?? deal.priceText ?? "-",
    deal.couponCode ?? "-",
    deal.membershipRequired ? "member" : "public",
    deal.targeted ? "targeted" : "untargeted",
    deal.channelNote ?? "-",
  ].join("|");
}

/** Collapse exact/near duplicates, keeping the strongest-scoring record. */
export function dedupeDeals(deals: PublicDeal[]): PublicDeal[] {
  const byKey = new Map<string, PublicDeal>();
  for (const deal of deals) {
    const key = dedupeKey(deal);
    const existing = byKey.get(key);
    if (!existing || deal.score > existing.score) byKey.set(key, deal);
  }
  return deals.filter((deal) => byKey.get(dedupeKey(deal)) === deal);
}

/**
 * Group same-product deals (admin-assigned `productGroup`, ≥2 members) into a
 * retailer-comparison item; everything else stays a standalone deal. Members
 * of a group must remain distinct offers — only the list presentation groups
 * them.
 */
export function groupDeals(deals: PublicDeal[]): DealListItem[] {
  const groups = new Map<string, PublicDeal[]>();
  for (const deal of deals) {
    if (!deal.productGroup) continue;
    const list = groups.get(deal.productGroup) ?? [];
    list.push(deal);
    groups.set(deal.productGroup, list);
  }

  const grouped = new Set<string>();
  const items: DealListItem[] = [];
  for (const deal of deals) {
    const key = deal.productGroup;
    if (key && (groups.get(key)?.length ?? 0) >= 2) {
      if (grouped.has(key)) continue;
      const options = [...(groups.get(key) ?? [])].sort((a, b) => {
        if (a.priceValue == null) return 1;
        if (b.priceValue == null) return -1;
        return a.priceValue - b.priceValue;
      });
      const distinctConditions = new Set(
        options.map((option) =>
          [option.membershipRequired, option.targeted, option.channelNote].join(
            "|",
          ),
        ),
      );
      if (distinctConditions.size > 1) {
        items.push({ type: "deal", deal });
        continue;
      }
      grouped.add(key);
      const group: DealGroup = {
        productGroup: key,
        title: options[0].title,
        options,
        fromPrice: options[0].priceValue,
      };
      items.push({ type: "group", group });
      continue;
    }
    items.push({ type: "deal", deal });
  }
  return items;
}

function itemScore(item: DealListItem): PublicDeal {
  return item.type === "deal" ? item.deal : item.group.options[0];
}

function timeOf(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Days-until-expiry sort key: sooner first, evergreen/absent last. */
function expiryKey(deal: PublicDeal): string {
  return deal.expiryDate ?? "9999-12-31";
}

const RECOMMENDED_TRUST_RANK: Record<PublicDeal["trust"], number> = {
  verified: 3,
  "source-checked": 2,
  community: 1,
  expired: 0,
};

export function sortItems(
  items: DealListItem[],
  sort: DealsParams["sort"],
  now: Date = new Date(),
): DealListItem[] {
  const sorted = [...items];
  switch (sort) {
    case "newest":
      sorted.sort(
        (a, b) =>
          timeOf(itemScore(b).postedAt ?? itemScore(b).lastCheckedAt) -
          timeOf(itemScore(a).postedAt ?? itemScore(a).lastCheckedAt),
      );
      break;
    case "discussed":
      sorted.sort((a, b) => {
        const comments =
          (itemScore(b).comments ?? -1) - (itemScore(a).comments ?? -1);
        if (comments !== 0) return comments;
        const votes = (itemScore(b).votes ?? -1) - (itemScore(a).votes ?? -1);
        if (votes !== 0) return votes;
        return (
          timeOf(itemScore(b).capturedAt ?? itemScore(b).lastCheckedAt) -
          timeOf(itemScore(a).capturedAt ?? itemScore(a).lastCheckedAt)
        );
      });
      break;
    case "expiring":
      sorted.sort((a, b) =>
        expiryKey(itemScore(a)).localeCompare(expiryKey(itemScore(b))),
      );
      break;
    case "saving":
      sorted.sort(
        (a, b) =>
          (itemScore(b).savingPercent ?? -1) -
          (itemScore(a).savingPercent ?? -1),
      );
      break;
    case "price-low":
      sorted.sort((a, b) => {
        const pa = itemScore(a).priceValue;
        const pb = itemScore(b).priceValue;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });
      break;
    case "checked":
      sorted.sort(
        (a, b) =>
          timeOf(itemScore(b).lastCheckedAt) -
          timeOf(itemScore(a).lastCheckedAt),
      );
      break;
    default:
      // Recommended precedence is deliberately lexicographic rather than one
      // blended score: verification outcome → confirmed current date → public
      // freshness → trust → saving relevance → existing quality/heat score →
      // recency. A newly ingested unknown-date row cannot leapfrog a comparable
      // confirmed-current offer.
      sorted.sort((a, b) => {
        const verified =
          Number(itemScore(b).dealStackVerified) -
          Number(itemScore(a).dealStackVerified);
        if (verified !== 0) return verified;

        const current =
          Number(itemScore(b).dateStatus === "confirmed-current") -
          Number(itemScore(a).dateStatus === "confirmed-current");
        if (current !== 0) return current;

        const freshnessRank = (deal: PublicDeal): number => {
          const state = publicFreshness(deal.lastCheckedAt, now).state;
          if (state === "checked-today") return 3;
          if (state === "checked-this-week") return 2;
          if (state === "needs-recheck") return 1;
          return 0;
        };
        const freshness =
          freshnessRank(itemScore(b)) - freshnessRank(itemScore(a));
        if (freshness !== 0) return freshness;

        const trust =
          RECOMMENDED_TRUST_RANK[itemScore(b).trust] -
          RECOMMENDED_TRUST_RANK[itemScore(a).trust];
        if (trust !== 0) return trust;

        const saving =
          (itemScore(b).savingPercent ?? -1) -
          (itemScore(a).savingPercent ?? -1);
        if (saving !== 0) return saving;

        const score = itemScore(b).score - itemScore(a).score;
        if (score !== 0) return score;

        return (
          timeOf(itemScore(b).postedAt ?? itemScore(b).lastCheckedAt) -
          timeOf(itemScore(a).postedAt ?? itemScore(a).lastCheckedAt)
        );
      });
  }
  return sorted;
}

/**
 * The matched, deduped pool for a request — every live deal that satisfies the
 * search and filters, before grouping/sorting/pagination. Shared by the result
 * list and the top-recommendations strip so they can never disagree.
 */
export function matchDeals(
  deals: PublicDeal[],
  params: DealsParams,
  now: Date = new Date(),
): PublicDeal[] {
  const live = filterActive(deals, now);
  return dedupeDeals(
    live.filter(
      (deal) =>
        matchesSearch(deal, params.q) && matchesFilters(deal, params, now),
    ),
  );
}

/** Full pipeline for results mode. Expired records are excluded up front. */
export function queryDeals(
  deals: PublicDeal[],
  params: DealsParams,
  now: Date = new Date(),
): DealsQueryResult {
  const matched = matchDeals(deals, params, now);
  const effectiveSort =
    params.view === "recent"
      ? "checked"
      : params.view === "popular"
        ? "discussed"
        : params.sort;
  const items = sortItems(groupDeals(matched), effectiveSort, now);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    total,
    page,
    pageCount,
  };
}
