import { XMLParser } from "fast-xml-parser";

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

export const GCDB_PARSER_VERSION = 2;

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
  /** Bounded plain-text factual excerpt (never the full body). */
  excerpt: string;
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

/** "17 Jul 2026" / "17 July 2026" → "2026-07-17" (AU-written dates). */
export function parseAuDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "8 Jul to 14 Jul 2026" -> both ISO dates, inferring the first year. */
export function parseAuDateRange(
  raw: string | null | undefined
): { startsAt: string; endsAt: string } | null {
  if (!raw) return null;
  const match = raw.match(
    /(\d{1,2}\s+[A-Za-z]{3,9}\.?(?:\s+\d{4})?)\s+(?:to|[-–—])\s+(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4})/i
  );
  if (!match) return null;
  const endsAt = parseAuDate(match[2]);
  const year = match[2].match(/\b(\d{4})\b/)?.[1];
  const startsAt = parseAuDate(
    /\b\d{4}\b/.test(match[1]) ? match[1] : `${match[1]} ${year ?? ""}`
  );
  return startsAt && endsAt ? { startsAt, endsAt } : null;
}

/** WordPress guid "…?post_type=offer&p=12870" → "12870". */
function externalIdFrom(guid: string | null, link: string | null): string | null {
  const fromGuid = guid?.match(/[?&]p=(\d+)/)?.[1];
  if (fromGuid) return fromGuid;
  const fromLink = link?.match(/\/offer\/(\d+)/)?.[1];
  if (fromLink) return fromLink;
  return link ? canonicaliseUrl(link) : null;
}

/** Lowercase host, https, strip query/hash/trailing slash — dedupe key + link. */
export function canonicaliseUrl(url: string): string {
  try {
    const u = new URL(url.trim());
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
  const externalId = externalIdFrom(textOf(item.guid), link);
  if (!externalId) return null;

  const description = stripHtml(textOf(item.description) ?? "");
  // Factual date markers GCDB writes into the body. Most supermarket offers
  // use a compact range ("8 Jul to 14 Jul 2026"), while past items switch to
  // "Expired 14 Jul 2026". Both were previously missed and therefore looked
  // ongoing in production.
  const range = parseAuDateRange(description);
  const sourceMarkedExpired = /\bexpired\s+\d{1,2}\s+[A-Za-z]{3,9}/i.test(
    description
  );
  const isOngoing = /\bongoing\s+offer\b/i.test(description);
  const endsAt =
    range?.endsAt ??
    parseAuDate(description.match(/(?:ends|expired)\s+([^.]{0,30})/i)?.[1]);
  const startsAt =
    range?.startsAt ??
    parseAuDate(description.match(/starts\s+([^.]{0,30})/i)?.[1]);
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
    canonicalUrl: canonicaliseUrl(link),
    title,
    publishedAt: toIso(textOf(item.pubDate)),
    offerType: textOf(item.offer_type)?.trim().toLowerCase() ?? null,
    sellerName: textOf(item.offer_store)?.trim() ?? null,
    giftCardBrands: [...new Set(brands)],
    startsAt,
    endsAt,
    isOngoing,
    sourceMarkedExpired,
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
