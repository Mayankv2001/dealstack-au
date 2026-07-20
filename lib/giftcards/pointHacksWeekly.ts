import { createHash } from "node:crypto";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import type { ExtractedOffer, PromotionType } from "./extractOffer";
import {
  canonicaliseUrl,
  parseAuDate,
  type GcdbFeedItem,
} from "./parseGcdbFeed";
import {
  bonusEffectiveDiscountPercent,
  effectiveDiscountPercent,
} from "./value";
export {
  decideAutomatedRetrieval as decideWeeklyAutomatedRetrieval,
  type AutomatedRetrievalDecision as WeeklyRetrievalDecision,
  type SourceRetrievalPermission as WeeklySourcePermission,
} from "./sourceRetrievalPermission";

export const POINT_HACKS_WEEKLY_SOURCE_ID =
  "pointhacks_weekly_gift_cards";
export const POINT_HACKS_WEEKLY_URL =
  "https://www.pointhacks.com.au/weekly-gift-card-offers/";
export const POINT_HACKS_WEEKLY_PARSER_VERSION = 1;

export const POINT_HACKS_WEEKLY_POLICY = {
  id: POINT_HACKS_WEEKLY_SOURCE_ID,
  canonicalUrl: POINT_HACKS_WEEKLY_URL,
  sourceRole: "specialist-editorial",
  attribution: "Point Hacks",
  approvalRequired: true,
  autoPublish: false,
} as const;

export type WeeklyPromotionType =
  | "discount"
  | "bonus-value"
  | "points"
  | "fixed-points"
  | "mixed"
  | "unknown";

export interface WeeklyGiftCardFacts {
  weekIdentifier: string | null;
  startDate: string;
  endDate: string;
  seller: "Coles" | "Woolworths";
  loyaltyProgramme: "Flybuys" | "Everyday Rewards" | null;
  promotionType: WeeklyPromotionType;
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  fixedPoints: number | null;
  giftCardBrands: string[];
  denominations: number[];
  variableLoadRange: { min: number; max: number } | null;
  perCustomerLimit: number | null;
  perMemberLimit: number | null;
  perDayLimit: number | null;
  excludedDenominations: number[];
  excludedCardVariants: string[];
  retailerCatalogueUrl: string | null;
  discoverySourceUrl: string;
  sourcePublishedAt: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function isoDate(day: number, month: string, year: number): string | null {
  const monthNumber = MONTHS[month.toLowerCase()];
  if (!monthNumber || day < 1 || day > 31 || year < 2000 || year > 2100)
    return null;
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** AU-written ranges, including a range crossing a month boundary. */
export function parseWeeklyOfferPeriod(
  value: string,
): { startDate: string; endDate: string } | null {
  const sameMonth = value.match(
    /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b/i,
  );
  if (sameMonth) {
    const startDate = isoDate(
      Number(sameMonth[1]),
      sameMonth[3],
      Number(sameMonth[4]),
    );
    const endDate = isoDate(
      Number(sameMonth[2]),
      sameMonth[3],
      Number(sameMonth[4]),
    );
    return startDate && endDate ? { startDate, endDate } : null;
  }
  const crossMonth = value.match(
    /\b(\d{1,2})\s+([A-Za-z]+)\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b/i,
  );
  if (!crossMonth) return null;
  const year = Number(crossMonth[5]);
  const startDate = isoDate(Number(crossMonth[1]), crossMonth[2], year);
  const endDate = isoDate(Number(crossMonth[3]), crossMonth[4], year);
  return startDate && endDate ? { startDate, endDate } : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function factualLines(html: string): string[] {
  return decodeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|svg|picture)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(?:p|li|h[1-6]|tr|td|th|section|article|div)>/gi, "\n")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function linksFromHtml(html: string): Array<{ href: string; label: string }> {
  return [
    ...html.matchAll(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ].flatMap((match) => {
    const href = canonicaliseUrl(decodeHtml(match[1]));
    if (!href) return [];
    const label = decodeHtml(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    return [{ href, label }];
  });
}

function uniqueNumbers(matches: Iterable<RegExpMatchArray>): number[] {
  return [
    ...new Set(
      [...matches]
        .map((match) => Number(match[1].replace(/,/g, "")))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ].sort((a, b) => a - b);
}

function retailerEvidence(
  seller: WeeklyGiftCardFacts["seller"],
  links: Array<{ href: string; label: string }>,
): string | null {
  const host =
    seller === "Coles"
      ? /(^|\.)coles\.com\.au$/
      : /(^|\.)woolworths\.com\.au$/;
  return (
    links.find(({ href, label }) => {
      const url = new URL(href);
      return (
        host.test(url.hostname) &&
        /catalogue|promotion|offer/i.test(`${label} ${url.pathname}`)
      );
    })?.href ?? null
  );
}

function extractBrands(line: string, seller: string): string[] {
  const raw = line.match(
    /(?:on|of|for)?\s*([A-Z][A-Za-z0-9&.'’ -]{1,100}?)\s+gift\s*cards?/i,
  )?.[1];
  if (!raw) return [];
  const cleaned = raw
    .replace(/^.*?\b(?:value on|points on|off|discount on)\s+/i, "")
    .replace(new RegExp(`\\s+at\\s+${seller}.*$`, "i"), "")
    .replace(/^(?:selected|eligible)\s+/i, "")
    .trim();
  return cleaned
    .split(/\s*(?:,|\band\b)\s*/i)
    .map((brand) => brand.trim())
    .filter((brand) => brand.length > 1)
    .slice(0, 20);
}

function positiveMatch(block: string, pattern: RegExp): number | null {
  const raw = block.match(pattern)?.[1];
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseOfferBlock(
  block: string,
  period: { startDate: string; endDate: string },
  weekIdentifier: string | null,
  links: Array<{ href: string; label: string }>,
  sourceUrl: string,
  sourcePublishedAt: string | null,
): WeeklyGiftCardFacts | null {
  // Seller, mechanic, programme and brand belong to the headline. Restrict
  // identity parsing to it so a following retailer-evidence link cannot make
  // a Coles offer look like a Woolworths offer (or vice versa).
  const headline = block.split(". ", 1)[0] ?? block;
  const seller = /\bwoolworths\b/i.test(headline)
    ? "Woolworths"
    : /\bcoles\b/i.test(headline)
      ? "Coles"
      : null;
  if (!seller) return null;
  const bonusPercent = positiveMatch(
    headline,
    /(\d+(?:\.\d+)?)\s*%\s*(?:bonus\s*)?(?:value|extra value)/i,
  );
  const discountPercent = bonusPercent
    ? null
    : positiveMatch(headline, /(\d+(?:\.\d+)?)\s*%\s*(?:off|discount)/i);
  const pointsMultiplier = positiveMatch(
    headline,
    /\b(\d{1,3})\s*[x×](?=\s|$)/i,
  );
  const fixedPoints = positiveMatch(
    headline,
    /\b([\d,]+)\s+bonus\s+(?:flybuys|everyday rewards)?\s*points?\b/i,
  );
  const loyaltyProgramme = /\beveryday\s+rewards\b/i.test(headline)
    ? "Everyday Rewards"
    : /\bflybuys\b/i.test(headline)
      ? "Flybuys"
      : null;
  const values = [
    bonusPercent,
    discountPercent,
    pointsMultiplier,
    fixedPoints,
  ].filter((value) => value != null);
  const promotionType: WeeklyPromotionType =
    values.length > 1
      ? "mixed"
      : bonusPercent
        ? "bonus-value"
        : discountPercent
          ? "discount"
          : pointsMultiplier
            ? "points"
            : fixedPoints
              ? "fixed-points"
              : "unknown";
  const giftCardBrands = extractBrands(headline, seller);
  if (giftCardBrands.length === 0) return null;

  const variable = block.match(
    /(?:variable(?:-load)?|load)\s*(?:from)?\s*\$([\d,]+)\s*(?:-|–|—|to)\s*\$([\d,]+)/i,
  );
  const excludedDenominations = uniqueNumbers(
    block.matchAll(
      /(?:exclud(?:e|es|ing)|not\s+valid\s+on)[^.;]{0,80}?\$([\d,]+)/gi,
    ),
  );
  const denominations = uniqueNumbers(
    block.matchAll(
      /\$([\d,]+)(?=\s*(?:denomination|gift\s*card|card|,|and|or))/gi,
    ),
  ).filter((value) => !excludedDenominations.includes(value));
  const excludedCardVariants = [
    ...block.matchAll(
      /(?:exclud(?:e|es|ing)|not\s+valid\s+on)\s+([^.;]{2,100})/gi,
    ),
  ]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter((value) => !/^\$/.test(value))
    .slice(0, 10);

  return {
    weekIdentifier,
    startDate: period.startDate,
    endDate: period.endDate,
    seller,
    loyaltyProgramme,
    promotionType,
    discountPercent,
    bonusPercent,
    pointsMultiplier,
    fixedPoints,
    giftCardBrands,
    denominations,
    variableLoadRange: variable
      ? {
          min: Number(variable[1].replace(/,/g, "")),
          max: Number(variable[2].replace(/,/g, "")),
        }
      : null,
    perCustomerLimit: positiveMatch(
      block,
      /limit\s+(?:of\s+)?([\d,]+)\s+(?:per\s+)?customer/i,
    ),
    perMemberLimit: positiveMatch(
      block,
      /limit\s+(?:of\s+)?([\d,]+)\s+(?:per\s+)?member/i,
    ),
    perDayLimit: positiveMatch(
      block,
      /limit\s+(?:of\s+)?([\d,]+)\s+(?:per\s+)?day/i,
    ),
    excludedDenominations,
    excludedCardVariants,
    retailerCatalogueUrl: retailerEvidence(seller, links),
    discoverySourceUrl: sourceUrl,
    sourcePublishedAt,
  };
}

/** Pure parser for a stored/admin-supplied or explicitly permitted snapshot. */
export function parsePointHacksWeeklyPage(
  html: string,
  sourceUrl: string = POINT_HACKS_WEEKLY_URL,
): WeeklyGiftCardFacts[] {
  const safeSource = safeHttpsUrl(sourceUrl);
  if (!safeSource || !html.trim()) return [];
  const lines = factualLines(html);
  const documentText = lines.join(" ");
  const period = parseWeeklyOfferPeriod(documentText);
  if (!period) return [];
  const week = documentText.match(/\bweek\s+(\d{1,2})\b/i)?.[1];
  const weekIdentifier = week ? `Week ${week}` : null;
  const sourcePublishedAt =
    parseAuDate(
      documentText.match(
        /(?:published|updated)\s+(\d{1,2}\s+[A-Za-z]+\s+20\d{2})/i,
      )?.[1],
    ) ?? null;
  const links = linksFromHtml(html);
  const offerIndexes = lines.flatMap((line, index) =>
    /gift\s*cards?/i.test(line) &&
    /(?:\d+(?:\.\d+)?\s*%|\d{1,3}\s*[x×]|[\d,]+\s+bonus\s+(?:(?:flybuys|everyday rewards)\s+)?points?)/i.test(
      line,
    )
      ? [index]
      : [],
  );
  return offerIndexes.flatMap((lineIndex, position) => {
    const next = offerIndexes[position + 1] ?? lines.length;
    const block = lines
      .slice(lineIndex, Math.min(next, lineIndex + 5))
      .join(". ");
    const facts = parseOfferBlock(
      block,
      period,
      weekIdentifier,
      links,
      safeSource,
      sourcePublishedAt,
    );
    return facts ? [facts] : [];
  });
}

function factsKey(facts: WeeklyGiftCardFacts): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        seller: facts.seller,
        brands: [...facts.giftCardBrands].sort(),
        promotionType: facts.promotionType,
        discountPercent: facts.discountPercent,
        bonusPercent: facts.bonusPercent,
        pointsMultiplier: facts.pointsMultiplier,
        fixedPoints: facts.fixedPoints,
        startDate: facts.startDate,
        endDate: facts.endDate,
      }),
    )
    .digest("hex")
    .slice(0, 24);
}

function mechanicLabel(facts: WeeklyGiftCardFacts): string {
  if (facts.discountPercent) return `${facts.discountPercent}% off`;
  if (facts.bonusPercent) return `${facts.bonusPercent}% bonus value`;
  if (facts.pointsMultiplier)
    return `${facts.pointsMultiplier}× ${facts.loyaltyProgramme ?? "points"}`;
  if (facts.fixedPoints)
    return `${facts.fixedPoints.toLocaleString("en-AU")} bonus points`;
  return "Conditional promotion";
}

export function weeklyFactsToSourceItem(
  facts: WeeklyGiftCardFacts,
): GcdbFeedItem {
  const notes = [
    facts.perCustomerLimit
      ? `Limit ${facts.perCustomerLimit} per customer.`
      : "",
    facts.perMemberLimit ? `Limit ${facts.perMemberLimit} per member.` : "",
    facts.perDayLimit ? `Limit ${facts.perDayLimit} per day.` : "",
    facts.variableLoadRange
      ? `Variable load $${facts.variableLoadRange.min}–$${facts.variableLoadRange.max}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    externalId: `weekly-${facts.startDate}-${factsKey(facts)}`,
    canonicalUrl: facts.discoverySourceUrl,
    title: `${mechanicLabel(facts)} on ${facts.giftCardBrands.join(", ")} gift cards at ${facts.seller}`,
    publishedAt: facts.sourcePublishedAt
      ? `${facts.sourcePublishedAt}T00:00:00.000Z`
      : null,
    offerType: facts.promotionType,
    sellerName: facts.seller,
    giftCardBrands: facts.giftCardBrands,
    startsAt: facts.startDate,
    endsAt: facts.endDate,
    isOngoing: false,
    sourceMarkedExpired: false,
    excerpt: notes.slice(0, 280),
    weeklyFacts: facts,
  };
}

function toPromotionType(facts: WeeklyGiftCardFacts): PromotionType {
  if (facts.promotionType === "fixed-points") return "points";
  return facts.promotionType;
}

export function extractPointHacksWeeklyOffer(
  item: GcdbFeedItem,
): ExtractedOffer[] {
  const facts = item.weeklyFacts;
  if (!facts) return [];
  const type = toPromotionType(facts);
  const warnings: string[] = [];
  if (!facts.retailerCatalogueUrl)
    warnings.push("Retailer catalogue evidence is not attached.");
  if (type === "mixed")
    warnings.push(
      "Mixed or conditional promotion requires separate atomic review.",
    );
  if (type === "points" && !facts.loyaltyProgramme)
    warnings.push("Points programme is not recorded.");
  if (facts.fixedPoints != null)
    warnings.push("Fixed points require a qualifying threshold before approval.");
  const effective = effectiveDiscountPercent({
    promotionType: type,
    discountPercent: facts.discountPercent,
    bonusPercent: facts.bonusPercent,
    pointsMultiplier: facts.pointsMultiplier,
    fixedPoints: facts.fixedPoints,
    pointsProgram: facts.loyaltyProgramme,
  });
  const key = `${facts.seller}-${facts.giftCardBrands.join("-")}-${type}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return [
    {
      subOfferKey: key,
      parentIsCompound: type === "mixed",
      sourcePresence: "present",
      promotionType: type,
      rewardDestination:
        type === "bonus-value"
          ? "gift-card-value"
          : type === "points"
            ? "loyalty-points"
            : type === "discount"
              ? "checkout-discount"
              : null,
      sellerName: facts.seller,
      giftCardBrands: facts.giftCardBrands,
      discountPercent: facts.discountPercent,
      bonusPercent: facts.bonusPercent,
      pointsMultiplier: facts.pointsMultiplier,
      fixedPoints: facts.fixedPoints,
      pointsProgram: facts.loyaltyProgramme,
      fixedDiscountDollars: null,
      promoCreditDollars: null,
      feeWaiverDollars: null,
      thresholdDollars: null,
      effectiveDiscountPercent:
        type === "bonus-value" && facts.bonusPercent
          ? bonusEffectiveDiscountPercent(facts.bonusPercent)
          : effective,
      startsAt: facts.startDate,
      expiresAt: facts.endDate,
      isOngoing: false,
      sourceMarkedExpired: false,
      whileStocksLast: false,
      membershipRequired: Boolean(facts.loyaltyProgramme),
      activationRequired: false,
      couponRequired: false,
      targeted: false,
      minSpend: null,
      purchaseLimitNote:
        [
          facts.perCustomerLimit
            ? `${facts.perCustomerLimit} per customer`
            : null,
          facts.perMemberLimit ? `${facts.perMemberLimit} per member` : null,
          facts.perDayLimit ? `${facts.perDayLimit} per day` : null,
        ]
          .filter(Boolean)
          .join("; ") || null,
      confidence: facts.retailerCatalogueUrl ? 0.9 : 0.72,
      warnings,
      weeklyFacts: facts,
    },
  ];
}

function optionalPositive(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numberList(value: string): number[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map(Number)
        .filter((number) => Number.isFinite(number) && number > 0),
    ),
  ].sort((a, b) => a - b);
}

export function parseWeeklyAdminSubmission(
  values: Record<string, string>,
): { ok: true; facts: WeeklyGiftCardFacts } | { ok: false; error: string } {
  const seller =
    values.seller === "Coles" || values.seller === "Woolworths"
      ? values.seller
      : null;
  if (!seller) return { ok: false, error: "Choose Coles or Woolworths." };
  if (safeHttpsUrl(values.discoverySourceUrl ?? "") !== POINT_HACKS_WEEKLY_URL)
    return {
      ok: false,
      error: "Use the canonical Point Hacks weekly source URL.",
    };
  if (
    !/^20\d{2}-\d{2}-\d{2}$/.test(values.startDate ?? "") ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(values.endDate ?? "")
  )
    return {
      ok: false,
      error: "A valid weekly start and end date are required.",
    };
  if (values.endDate < values.startDate)
    return {
      ok: false,
      error: "The end date must not precede the start date.",
    };
  const giftCardBrands = (values.giftCardBrands ?? "")
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (giftCardBrands.length === 0)
    return {
      ok: false,
      error: "At least one gift-card brand is required.",
    };
  const allowed: WeeklyPromotionType[] = [
    "discount",
    "bonus-value",
    "points",
    "fixed-points",
    "mixed",
    "unknown",
  ];
  const promotionType = allowed.includes(
    values.promotionType as WeeklyPromotionType,
  )
    ? (values.promotionType as WeeklyPromotionType)
    : "unknown";
  const discountPercent = optionalPositive(values.discountPercent ?? "");
  const bonusPercent = optionalPositive(values.bonusPercent ?? "");
  const pointsMultiplier = optionalPositive(values.pointsMultiplier ?? "");
  const fixedPoints = optionalPositive(values.fixedPoints ?? "");
  const hasValue =
    (promotionType === "discount" && discountPercent != null) ||
    (promotionType === "bonus-value" && bonusPercent != null) ||
    (promotionType === "points" && pointsMultiplier != null) ||
    (promotionType === "fixed-points" && fixedPoints != null) ||
    promotionType === "mixed";
  if (!hasValue)
    return {
      ok: false,
      error: "Enter the value required for the selected promotion type.",
    };
  const retailerCatalogueUrl = values.retailerCatalogueUrl?.trim()
    ? safeHttpsUrl(values.retailerCatalogueUrl)
    : null;
  if (values.retailerCatalogueUrl?.trim() && !retailerCatalogueUrl)
    return {
      ok: false,
      error: "Retailer evidence must be a safe HTTPS URL.",
    };
  const loyaltyProgramme =
    values.loyaltyProgramme === "Flybuys" ||
    values.loyaltyProgramme === "Everyday Rewards"
      ? values.loyaltyProgramme
      : null;
  if (
    (promotionType === "points" || promotionType === "fixed-points") &&
    !loyaltyProgramme
  )
    return {
      ok: false,
      error: "A loyalty programme is required for points offers.",
    };
  const variableMin = optionalPositive(values.variableLoadMin ?? "");
  const variableMax = optionalPositive(values.variableLoadMax ?? "");
  if (
    (variableMin == null) !== (variableMax == null) ||
    (variableMin != null && variableMax != null && variableMin > variableMax)
  )
    return {
      ok: false,
      error: "Enter a valid complete variable-load range.",
    };
  return {
    ok: true,
    facts: {
      weekIdentifier: values.weekIdentifier?.trim() || null,
      startDate: values.startDate,
      endDate: values.endDate,
      seller,
      loyaltyProgramme,
      promotionType,
      discountPercent,
      bonusPercent,
      pointsMultiplier,
      fixedPoints,
      giftCardBrands,
      denominations: numberList(values.denominations ?? ""),
      variableLoadRange:
        variableMin != null && variableMax != null
          ? { min: variableMin, max: variableMax }
          : null,
      perCustomerLimit: optionalPositive(values.perCustomerLimit ?? ""),
      perMemberLimit: optionalPositive(values.perMemberLimit ?? ""),
      perDayLimit: optionalPositive(values.perDayLimit ?? ""),
      excludedDenominations: numberList(values.excludedDenominations ?? ""),
      excludedCardVariants: (values.excludedCardVariants ?? "")
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 20),
      retailerCatalogueUrl,
      discoverySourceUrl: POINT_HACKS_WEEKLY_URL,
      sourcePublishedAt: /^20\d{2}-\d{2}-\d{2}$/.test(
        values.sourcePublishedAt ?? "",
      )
        ? values.sourcePublishedAt
        : null,
    },
  };
}
