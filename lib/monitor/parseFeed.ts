import { XMLParser } from "fast-xml-parser";

/**
 * Pure RSS/Atom feed parser — OFFLINE ONLY.
 *
 * Takes a feed XML STRING and returns normalised entries. There is NO network
 * here: this module never calls fetch and never reaches OzBargain — the
 * compliance-gated fetcher is the only thing allowed to
 * make a request, and it will hand the response body to this parser. Tests feed
 * it local fixture XML only.
 *
 * Supports the common subset of RSS 2.0 and Atom: title, link, guid/id,
 * description/summary, pubDate/updated, and category/tags. HTML stripping, date
 * normalisation, id and hash generation live in mapFeedItem.ts.
 */

/** A single feed entry, structurally normalised across RSS and Atom. */
export interface ParsedFeedItem {
  title: string;
  /** Canonical link, or null when the feed omits one. */
  link: string | null;
  /** Raw guid (RSS) or id (Atom); null when absent. */
  guid: string | null;
  /** Raw description/summary — may contain HTML; cleaned later. */
  summary: string;
  /** Raw pubDate/updated/published string; null when absent. */
  published: string | null;
  categories: string[];
  /** Optional feed-supplied image URL; never fetched by the monitor. */
  thumbnailUrl?: string | null;
  /**
   * Raw source-declared expiry timestamp from a structured feed extension —
   * OzBargain's `<ozb:meta expiry="…">` attribute. Normalised in mapFeedItem.
   */
  declaredExpiry?: string | null;
  /**
   * True when the feed itself marks the item expired/out-of-stock —
   * OzBargain's `<ozb:title-msg type="expired">`. Other marker types
   * (targeted, upcoming) are deliberately ignored.
   */
  sourceMarkedExpired?: boolean;
}

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  processEntities: true,
  parseAttributeValue: false,
  // Force arrays for the repeating nodes so single/multiple are handled alike.
  isArray: (name: string) =>
    name === "item" || name === "entry" || name === "category",
});

/** Coerce a tag value (string | number | { "#text" } | …) to text or null. */
function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (typeof node === "object") {
    const text = (node as XmlNode)["#text"];
    if (text != null) return String(text);
  }
  return null;
}

/** RSS <link>text</link> or Atom <link href rel/>; prefers rel="alternate". */
function linkOf(node: unknown): string | null {
  if (node == null) return null;
  const candidates = Array.isArray(node) ? node : [node];
  let fallback: string | null = null;
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const value = candidate.trim();
      if (value && !fallback) fallback = value;
      continue;
    }
    if (candidate && typeof candidate === "object") {
      const obj = candidate as XmlNode;
      const value =
        (textOf(obj["@_href"]) ?? textOf(obj["#text"]))?.trim() ?? null;
      if (!value) continue;
      const rel = textOf(obj["@_rel"]);
      if (rel === "alternate" || rel == null) return value;
      if (!fallback) fallback = value;
    }
  }
  return fallback;
}

/** RSS <category>text</category> or Atom <category term/>, de-blanked + trimmed. */
function categoriesOf(node: unknown): string[] {
  if (node == null) return [];
  const candidates = Array.isArray(node) ? node : [node];
  const out: string[] = [];
  for (const candidate of candidates) {
    let value: string | null = null;
    if (typeof candidate === "string") {
      value = candidate;
    } else if (candidate && typeof candidate === "object") {
      const obj = candidate as XmlNode;
      value = textOf(obj["@_term"]) ?? textOf(obj["#text"]);
    }
    if (value && value.trim() !== "") out.push(value.trim());
  }
  return out;
}

/**
 * Child ELEMENT nodes whose local name matches, under any namespace prefix —
 * `<ozb:meta>`, `<ozbargain:meta>` and `<meta>` all match "meta". The parser
 * keeps prefixes in key names, so a prefix rename by the source must not
 * silently drop the field. Attribute keys (`@_…`) and text children are
 * excluded: only element nodes (objects) can carry the attributes we read.
 */
function childrenByLocalName(node: XmlNode, localName: string): XmlNode[] {
  const suffix = `:${localName}`;
  const out: XmlNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) continue;
    if (key !== localName && !key.endsWith(suffix)) continue;
    const candidates = Array.isArray(value) ? value : value ? [value] : [];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object") {
        out.push(candidate as XmlNode);
      }
    }
  }
  return out;
}

/** First non-empty `expiry` attribute of a `meta` extension element, if any. */
function declaredExpiryOf(item: XmlNode): string | null {
  for (const node of childrenByLocalName(item, "meta")) {
    const value = textOf(node["@_expiry"])?.trim();
    if (value) return value;
  }
  return null;
}

/**
 * True only when a `title-msg` extension element carries exactly
 * type="expired". Markers with other, unknown, or missing type attributes
 * (targeted, upcoming, …) never count.
 */
function sourceMarkedExpiredOf(item: XmlNode): boolean {
  return childrenByLocalName(item, "title-msg").some(
    (node) => textOf(node["@_type"])?.trim().toLowerCase() === "expired"
  );
}

function thumbnailOf(item: XmlNode): string | null {
  for (const key of ["media:thumbnail", "media:content", "thumbnail", "enclosure"]) {
    const raw = item[key];
    const candidates = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const value = textOf((candidate as XmlNode)["@_url"])?.trim();
      if (value) return value;
    }
  }
  return null;
}

function mapRssItem(item: XmlNode): ParsedFeedItem {
  return {
    title: textOf(item.title) ?? "",
    link: linkOf(item.link),
    guid: textOf(item.guid),
    summary: textOf(item.description) ?? "",
    published: textOf(item.pubDate),
    categories: categoriesOf(item.category),
    thumbnailUrl: thumbnailOf(item),
    declaredExpiry: declaredExpiryOf(item),
    sourceMarkedExpired: sourceMarkedExpiredOf(item),
  };
}

function mapAtomEntry(entry: XmlNode): ParsedFeedItem {
  return {
    title: textOf(entry.title) ?? "",
    link: linkOf(entry.link),
    guid: textOf(entry.id),
    summary: textOf(entry.summary) ?? textOf(entry.content) ?? "",
    published: textOf(entry.updated) ?? textOf(entry.published),
    categories: categoriesOf(entry.category),
    thumbnailUrl: thumbnailOf(entry),
    // The ozb extension rides OzBargain's RSS 2.0 feeds; the helpers return
    // null/false when the elements are absent, so Atom stays uniform.
    declaredExpiry: declaredExpiryOf(entry),
    sourceMarkedExpired: sourceMarkedExpiredOf(entry),
  };
}

/**
 * Parse a feed XML string into normalised entries. Returns [] for input that is
 * neither an RSS channel nor an Atom feed (defensive — never throws on shape).
 */
export function parseFeed(xml: string): ParsedFeedItem[] {
  if (!xml || xml.trim() === "") return [];
  const doc = parser.parse(xml) as XmlNode;

  const rss = doc.rss as XmlNode | undefined;
  const channel = rss?.channel as XmlNode | undefined;
  if (channel) {
    const items = (channel.item as XmlNode[] | undefined) ?? [];
    return items.map(mapRssItem);
  }

  const feed = doc.feed as XmlNode | undefined;
  if (feed) {
    const entries = (feed.entry as XmlNode[] | undefined) ?? [];
    return entries.map(mapAtomEntry);
  }

  return [];
}
