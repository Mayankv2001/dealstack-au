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

  const contentHash = sha256(
    [rawTitle, rawSummary, link, categories.join("|"), postedAt ?? ""].join(
      ""
    )
  );

  return {
    source_native_id: makeSourceNativeId(item),
    link,
    raw_title: rawTitle,
    raw_summary: rawSummary,
    categories,
    posted_at: postedAt,
    content_hash: contentHash,
    thumbnail_url: item.thumbnailUrl ? safeHttpsUrl(item.thumbnailUrl) : null,
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
