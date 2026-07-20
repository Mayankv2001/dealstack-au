import { XMLParser } from "fast-xml-parser";
import type { WeeklyGiftCardFacts } from "./pointHacksWeekly";

/**
 * Pure GCDB RSS parser — OFFLINE ONLY, no network. The compliance-gated
 * fetcher hands this a feed XML string; tests feed it fixtures.
 *
 * The GCDB feed (WordPress RSS 2.0) carries structured offer metadata per
 * item — `<offer_type>`, `<offer_store>`, repeated `<offer_gc>` brand tags —
 * plus "Ends D Mon YYYY" inside the description. This module extracts ONLY
 * those structured facts and a bounded plain-text excerpt. It never keeps
 * article bodies, images, comment content or editorial prose.
 */

export const GCDB_PARSER_VERSION = 3;

/** Longest factual excerpt retained from a description (chars). */
export const MAX_EXCERPT_LENGTH = 280;

export interface GcdbFeedItem {
  /** Stable external id — the WordPress post id from the guid, else the URL. */
  externalId: string;
  canonicalUrl: string;
  title: string;
  /** ISO timestamp, or null when missing/unparseable. */
  publishedAt: string | null;
  /** GCDB's own offer classification, lower-cased ("discount", "points", …). */
  offerType: string | null;
  /** The retailer selling the card, e.g. "Coles", "Card.Gift". */
  sellerName: string | null;
  /** Gift-card brands the offer covers, e.g. ["TCN Love", "TCN Shop"]. */
  giftCardBrands: string[];
  /** "Ends"/"Starts" dates from the description, as YYYY-MM-DD (AU dates). */
  startsAt: string | null;
  endsAt: string | null;
  /** True only when the source explicitly labels the promotion ongoing. */
  isOngoing: boolean;
  /** True when the source explicitly labels the promotion expired. */
  sourceMarkedExpired: boolean;
  /**
   * True when the source limits availability by stock ("while stocks last",
   * "until sold out") — an honest availability constraint, never an expiry.
   */
  whileStocksLast?: boolean;
  /**
   * Verbatim date phrase(s) matched in the description, kept as evidence even
   * when the bounded excerpt truncates before them. Null when no date matched.
   */
  dateEvidence?: string | null;
  /** Bounded plain-text factual excerpt (never the full body). */
  excerpt: string;
  /** Structured facts supplied by the permission-gated weekly adapter. */
  weeklyFacts?: WeeklyGiftCardFacts;
}

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  processEntities: true,
  parseAttributeValue: false,
  isArray: (name: string) => name === "item" || name === "offer_gc",
});

function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node === "object") {
    const text = (node as XmlNode)["#text"];
    if (text != null) return String(text);
  }
  return null;
}

/** Strip tags/entities and collapse whitespace — plain factual text only. */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isoOf(year: number, month: number, day: number): string | null {
  if (!month || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** One AU date token: written "17 Jul[y] [2026]" or numeric "17/7[/2026]". */
const AU_WRITTEN_DATE = /(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?/;
const AU_NUMERIC_DATE = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/;

interface DayMonthYear {
  day: number;
  month: number;
  /** Null when the source omitted the year. */
  year: number | null;
}

function matchDayMonthYear(raw: string): DayMonthYear | null {
  const written = raw.match(AU_WRITTEN_DATE);
  if (written) {
    const month = MONTHS[written[2].slice(0, 3).toLowerCase()];
    if (month) {
      return {
        day: Number(written[1]),
        month,
        year: written[3] ? Number(written[3]) : null,
      };
    }
  }
  // Numeric AU dates are day-first ("24/07/2026"). Two-digit years are
  // rejected as ambiguous rather than guessed.
  const numeric = raw.match(AU_NUMERIC_DATE);
  if (numeric) {
    return {
      day: Number(numeric[1]),
      month: Number(numeric[2]),
      year: numeric[3] ? Number(numeric[3]) : null,
    };
  }
  return null;
}

/**
 * "17 Jul 2026" / "17 July 2026" / "17/07/2026" → "2026-07-17" (AU dates,
 * day-first). Dates without an explicit year return null here — year
 * inference needs an anchor; see parseAuDateWithAnchor.
 */
export function parseAuDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = matchDayMonthYear(raw);
  if (!parts || parts.year == null) return null;
  return isoOf(parts.year, parts.month, parts.day);
}

/**
 * Parse an AU date whose year may be omitted, inferring the year from an
 * anchor date (the item's own publication date). Deterministic by direction:
 * a deadline ("Ends 24 Jul") lies at or after the anchor, so a day-month
 * earlier in the year than the anchor rolls forward one year; an "Expired
 * 24 Jul" marker lies at or before the anchor and rolls backward instead.
 * Without an anchor, a yearless date stays null — never guessed.
 */
export function parseAuDateWithAnchor(
  raw: string | null | undefined,
  anchorIso: string | null,
  direction: "forward" | "backward"
): string | null {
  if (!raw) return null;
  const parts = matchDayMonthYear(raw);
  if (!parts) return null;
  if (parts.year != null) return isoOf(parts.year, parts.month, parts.day);
  if (!anchorIso) return null;
  const anchorYear = Number(anchorIso.slice(0, 4));
  if (!Number.isFinite(anchorYear)) return null;
  const sameYear = isoOf(anchorYear, parts.month, parts.day);
  if (!sameYear) return null;
  if (direction === "forward" && sameYear < anchorIso) {
    return isoOf(anchorYear + 1, parts.month, parts.day);
  }
  if (direction === "backward" && sameYear > anchorIso) {
    return isoOf(anchorYear - 1, parts.month, parts.day);
  }
  return sameYear;
}

/** One date token (written or numeric), optional year, for range matching. */
const RANGE_TOKEN = String.raw`\d{1,2}(?:\s+[A-Za-z]{3,9}\.?|\/\d{1,2})(?:,?\s+\d{4}|\/\d{4})?`;
const RANGE_PATTERN = new RegExp(
  `(${RANGE_TOKEN})\\s*(?:to|until|[-–—])\\s*(${RANGE_TOKEN})`,
  "i"
);

/**
 * "8 Jul to 14 Jul 2026" / "28 Dec to 3 Jan 2027" / "8/7/2026 – 14/7/2026" →
 * both ISO dates. The start year is inferred from the end date and corrected
 * across a year boundary (a December start of a January-ending promotion
 * belongs to the previous year). When BOTH sides omit the year the optional
 * anchor (publication date) resolves the end year deterministically; with no
 * year and no anchor the range is rejected rather than guessed.
 */
export function parseAuDateRange(
  raw: string | null | undefined,
  anchorIso: string | null = null
): { startsAt: string; endsAt: string } | null {
  if (!raw) return null;
  const match = raw.match(RANGE_PATTERN);
  if (!match) return null;
  const endParts = matchDayMonthYear(match[2]);
  if (!endParts) return null;
  const endsAt =
    endParts.year != null
      ? isoOf(endParts.year, endParts.month, endParts.day)
      : parseAuDateWithAnchor(match[2], anchorIso, "forward");
  if (!endsAt) return null;
  const startParts = matchDayMonthYear(match[1]);
  if (!startParts) return null;
  const endYear = Number(endsAt.slice(0, 4));
  let startsAt =
    startParts.year != null
      ? isoOf(startParts.year, startParts.month, startParts.day)
      : isoOf(endYear, startParts.month, startParts.day);
  // Year-boundary correction: an inferred start after the end date means the
  // promotion started late in the previous year.
  if (startsAt && startParts.year == null && startsAt > endsAt) {
    startsAt = isoOf(endYear - 1, startParts.month, startParts.day);
  }
  return startsAt && endsAt && startsAt <= endsAt ? { startsAt, endsAt } : null;
}

/** WordPress guid "…?post_type=offer&p=12870" → "12870". */
function externalIdFrom(guid: string | null, link: string | null): string | null {
  const fromGuid = guid?.match(/[?&]p=(\d+)/)?.[1];
  if (fromGuid) return fromGuid;
  const fromLink = link?.match(/\/offer\/(\d+)/)?.[1];
  if (fromLink) return fromLink;
  return link ? canonicaliseUrl(link) : null;
}

/**
 * Lowercase host, https, strip query/hash/trailing slash — dedupe key + link.
 * Rejects (returns null for) any scheme other than http/https: setting
 * `.protocol` on a WHATWG URL is a silent no-op for opaque-path schemes like
 * `javascript:`/`data:`, so without this check a hostile feed link would
 * survive unchanged and reach the admin review UI's anchor `href`.
 */
export function canonicaliseUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.protocol = "https:";
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase();
    return u.href.replace(/\/+$/, "/");
  } catch {
    return url.trim();
  }
}

function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function mapItem(item: XmlNode): GcdbFeedItem | null {
  const title = textOf(item.title)?.trim() ?? "";
  const link = textOf(item.link)?.trim() ?? null;
  if (!title || !link) return null;
  // Reject before externalIdFrom: its /offer/(\d+) regex runs on the raw
  // link string, so a crafted "javascript://host/offer/123/" would still
  // resolve a truthy id even though the scheme is unsafe.
  const canonicalUrl = canonicaliseUrl(link);
  if (!canonicalUrl) return null;
  const externalId = externalIdFrom(textOf(item.guid), link);
  if (!externalId) return null;

  const description = stripHtml(textOf(item.description) ?? "");
  const publishedAt = toIso(textOf(item.pubDate));
  // Year-inference anchor: the item's own publication date (calendar date).
  const anchorIso = publishedAt ? publishedAt.slice(0, 10) : null;
  // Factual date markers GCDB writes into the body. Most supermarket offers
  // use a compact range ("8 Jul to 14 Jul 2026"), while past items switch to
  // "Expired 14 Jul 2026". Both were previously missed and therefore looked
  // ongoing in production.
  const range = parseAuDateRange(description, anchorIso);
  const sourceMarkedExpired =
    /\bexpired\s+\d{1,2}\s+[A-Za-z]{3,9}/i.test(description) ||
    /\bexpired\s+\d{1,2}\/\d{1,2}/i.test(description);
  const isOngoing = /\bongoing\s+offer\b/i.test(description);
  // Stock-limited availability is an honest constraint, never an invented
  // expiry date.
  const whileStocksLast =
    /\bwhile\s+stocks?\s+lasts?\b|\buntil\s+sold\s+out\b/i.test(description);
  const endsMatch = description.match(/(?:ends|expired)\s+([^.]{0,30})/i);
  const startsMatch = description.match(/starts\s+([^.]{0,30})/i);
  // Deadlines infer a missing year forward from publication; an explicit
  // "Expired" marker lies in the past, so it infers backward instead.
  const endsAt =
    range?.endsAt ??
    parseAuDateWithAnchor(
      endsMatch?.[1],
      anchorIso,
      sourceMarkedExpired ? "backward" : "forward"
    );
  const startsAt =
    range?.startsAt ?? parseAuDateWithAnchor(startsMatch?.[1], anchorIso, "forward");
  // Verbatim evidence for the parsed dates, kept even when the bounded
  // excerpt truncates before the date phrase.
  const dateEvidence =
    [range ? description.match(RANGE_PATTERN)?.[0] : null, endsMatch?.[0], startsMatch?.[0]]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 160) || null;
  // Bounded excerpt: keep only the leading factual sentence(s), drop the
  // boilerplate "See Gift Card Database for more info" tail.
  const excerpt = description
    .replace(/see\s+gift\s+card\s+database.*$/i, "")
    .trim()
    .slice(0, MAX_EXCERPT_LENGTH);

  const brands = ((item.offer_gc as unknown[] | undefined) ?? [])
    .map((b) => textOf(b)?.trim())
    .filter((b): b is string => Boolean(b));

  return {
    externalId,
    canonicalUrl,
    title,
    publishedAt,
    offerType: textOf(item.offer_type)?.trim().toLowerCase() ?? null,
    sellerName: textOf(item.offer_store)?.trim() ?? null,
    giftCardBrands: [...new Set(brands)],
    startsAt,
    endsAt,
    isOngoing,
    sourceMarkedExpired,
    whileStocksLast,
    dateEvidence,
    excerpt,
  };
}

/** Parse a GCDB feed XML string. Defensive: malformed shapes yield []. */
export function parseGcdbFeed(xml: string): GcdbFeedItem[] {
  if (!xml || xml.trim() === "") return [];
  let doc: XmlNode;
  try {
    doc = parser.parse(xml) as XmlNode;
  } catch {
    return [];
  }
  const channel = (doc.rss as XmlNode | undefined)?.channel as XmlNode | undefined;
  if (!channel) return [];
  const items = (channel.item as XmlNode[] | undefined) ?? [];
  return items
    .map(mapItem)
    .filter((item): item is GcdbFeedItem => item !== null);
}
