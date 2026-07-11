import { createHash } from "node:crypto";
import type { ParsedFeedItem } from "./parseFeed";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * Pure mapper: ParsedFeedItem → an object shaped for a `feed_items` insert.
 *
 * OFFLINE ONLY — no network, no DB. It strips HTML, normalises dates, and
 * derives a stable `source_native_id` and a `content_hash`. The fetcher
 * adds the insert-time fields (`feed_source_id`, `fetched_at`, `review_state`);
 * those are not this module's concern.
 */

/** The subset of feed_items columns derived purely from a parsed entry. */
export interface FeedItemInsert {
  source_native_id: string;
  link: string;
  raw_title: string;
  raw_summary: string;
  categories: string[];
  /** ISO 8601 timestamp, or null when the feed date was absent/unparseable. */
  posted_at: string | null;
  content_hash: string;
  thumbnail_url: string | null;
  /** Source-declared expiry (OzBargain `ozb:meta expiry`), ISO 8601 or null. */
  declared_expires_at: string | null;
  /** Feed carried an explicit expired marker (`ozb:title-msg type="expired"`). */
  source_marked_expired: boolean;
}

const SUMMARY_MAX = 500;

/** Strip tags + decode a few common entities, then collapse whitespace. */
export function stripHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/<\/(p|div|br|li|h[1-6]|tr)\s*>/gi, " ") // block ends → a space
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "") // drop all remaining tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * A stable, safe id for dedupe/idempotent upsert. Prefers the feed guid, then
 * the link; falls back to a content hash so it is never empty. Namespaced with
 * `ozb:` so it can't collide with manually-entered signal ids.
 */
export function makeSourceNativeId(item: ParsedFeedItem): string {
  const basis = item.guid?.trim() || item.link?.trim();
  if (basis) return `ozb:${basis}`;
  return `ozb:sha256:${sha256(`${item.title}\n${item.summary}`)}`;
}

/** RFC-822 (pubDate) or ISO (updated) → ISO 8601, or null if unparseable. */
function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** ISO date or date-time (optional seconds/fraction, Z or ±hh[:]mm offset). */
const ISO_DATE_OR_DATETIME =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/;

/**
 * STRICT declared-expiry normalisation. Unlike posted_at (which must stay
 * lenient for RFC-822 pubDates), this value can trigger archival once passed,
 * so anything that is not an unambiguous ISO date/date-time is rejected —
 * Date.parse alone would happily accept garbage like "2026" or an RFC-822
 * string. Rejected values are stored as null and never archive.
 */
function declaredExpiryToIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!ISO_DATE_OR_DATETIME.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function capped(text: string): string {
  if (text.length <= SUMMARY_MAX) return text;
  return `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

/** Map one parsed entry into the feed_items-shaped insert object. */
export function mapFeedItem(item: ParsedFeedItem): FeedItemInsert {
  const rawTitle = stripHtml(item.title).trim() || "(untitled)";
  // Missing/blank description falls back to the title so raw_summary is useful.
  const summary = stripHtml(item.summary).trim();
  const rawSummary = capped(summary || rawTitle);
  const link = item.link?.trim() ?? "";
  const categories = item.categories;
  const postedAt = toIso(item.published);
  const declaredExpiresAt = declaredExpiryToIso(item.declaredExpiry);
  const sourceMarkedExpired = item.sourceMarkedExpired === true;

  // The U+0001 separator (kept from the original raw byte, now written as an
  // escape) makes the field concatenation unambiguous. The two source-state
  // fields are appended ONLY when present, so every pre-existing row's hash
  // stays unchanged, while a deal flipping to expired (or an edited declared
  // expiry) registers as an UPDATE on re-fetch.
  const hashBasis = [
    rawTitle,
    rawSummary,
    link,
    categories.join("|"),
    postedAt ?? "",
  ];
  if (declaredExpiresAt) hashBasis.push(`declared-expiry:${declaredExpiresAt}`);
  if (sourceMarkedExpired) hashBasis.push("source-expired");
  const contentHash = sha256(hashBasis.join("\u0001"));

  return {
    source_native_id: makeSourceNativeId(item),
    link,
    raw_title: rawTitle,
    raw_summary: rawSummary,
    categories,
    posted_at: postedAt,
    content_hash: contentHash,
    thumbnail_url: item.thumbnailUrl ? safeHttpsUrl(item.thumbnailUrl) : null,
    declared_expires_at: declaredExpiresAt,
    source_marked_expired: sourceMarkedExpired,
  };
}

/**
 * Map many entries, de-duplicating by `source_native_id` (first occurrence
 * wins) — mirrors the DB's unique constraint so a feed that repeats a guid
 * yields a single row.
 */
export function mapFeedItems(items: ParsedFeedItem[]): FeedItemInsert[] {
  const seen = new Set<string>();
  const out: FeedItemInsert[] = [];
  for (const item of items) {
    const mapped = mapFeedItem(item);
    if (seen.has(mapped.source_native_id)) continue;
    seen.add(mapped.source_native_id);
    out.push(mapped);
  }
  return out;
}
