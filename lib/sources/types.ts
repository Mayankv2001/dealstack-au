export type SourceId =
  | "ozbargain"
  | "pointhacks"
  | "freepoints"
  | "gcdb"
  | "manual";

export type DealKind =
  | "discount-code"
  | "cashback"
  | "gift-card"
  | "points"
  | "guide"
  | "card";

export type Confidence = "confirmed" | "needs-verification" | "expired-unknown";

/**
 * Normalised result emitted by every source adapter.
 * Deliberately has no field for page bodies — we store short summaries
 * and links only, never full source content.
 */
export interface DealSourceResult {
  /** Stable unique id: source prefix + slug */
  id: string;
  source: SourceId;
  kind: DealKind;
  /** Headline only */
  title: string;
  /** Merchant name as published, null if not merchant-specific */
  merchant: string | null;
  /** Matched Store.id from lib/data.ts, null if unmatched */
  merchantId: string | null;
  /** Our own short paraphrase, max ~200 chars */
  summary: string;
  discountPercent: number | null;
  pointsProgram: string | null;
  pointsAmount: string | null;
  giftCardBrand: string | null;
  cardOrProvider: string | null;
  /** ISO date, null = unknown */
  expiryDate: string | null;
  startDate: string | null;
  /** Canonical link to the source page — always present */
  sourceUrl: string;
  publishedAt: string | null;
  /** When we last verified the item at the source (ISO datetime) */
  lastCheckedAt: string;
  /** Stored confidence; display confidence is re-derived at read time */
  confidence: Confidence;
}

export interface Citation {
  source: SourceId;
  sourceUrl: string;
}

/** A result after dedupe + ranking, ready for display */
export interface RankedDealResult extends DealSourceResult {
  score: number;
  /** All sources corroborating this item (≥1, includes its own) */
  citations: Citation[];
}

export interface SourceMeta {
  displayName: string;
  homepage: string;
  /**
   * Editorial ownership/corroboration family. Two branded sites operated by
   * the same publisher remain separate links, but count as one independent
   * source family when DealStack explains corroboration.
   */
  publisherFamily: string;
  /** 0..1 ranking trust factor */
  trustWeight: number;
}

export const SOURCE_META: Record<SourceId, SourceMeta> = {
  ozbargain: {
    displayName: "OzBargain",
    homepage: "https://www.ozbargain.com.au",
    publisherFamily: "ozbargain",
    trustWeight: 0.85,
  },
  pointhacks: {
    displayName: "Point Hacks",
    homepage: "https://www.pointhacks.com.au",
    publisherFamily: "pointhacks",
    trustWeight: 0.8,
  },
  freepoints: {
    displayName: "FreePoints",
    homepage: "https://www.freepoints.com.au",
    publisherFamily: "freepoints-network",
    trustWeight: 0.75,
  },
  gcdb: {
    displayName: "GCDB",
    homepage: "https://www.gcdb.com.au",
    publisherFamily: "freepoints-network",
    trustWeight: 0.8,
  },
  manual: {
    displayName: "DealStack verified",
    homepage: "/",
    publisherFamily: "dealstack",
    trustWeight: 1,
  },
};
