import { createHash } from "node:crypto";
import { classifyOfferChange, type ChangeKind } from "./classifyChange";
import { extractOffers, EXTRACTOR_VERSION, type ExtractedOffer } from "./extractOffer";
import {
  GCDB_PARSER_VERSION,
  parseGcdbFeed,
  type GcdbFeedItem,
} from "./parseGcdbFeed";

/**
 * Gift-card ingest orchestrator — dependency-injected (clock, fetch, repo) so
 * the whole flow is unit-testable offline, mirroring runRecheckExpiry.
 *
 * Idempotency: items dedupe on the source external id; unchanged content
 * (stable hash) only bumps last_seen; changed content updates the raw item in
 * place and stages a review candidate carrying a change classification. An
 * approved offer is NEVER touched directly — material changes only flag a
 * `changed` candidate for admin review. Items that disappear from the feed
 * are left untouched (the feed is a window, not the universe); expiry is
 * handled conservatively by the existing read-time expiry guard.
 */

export interface IngestSourceConfig {
  id: string;
  feedUrl: string;
  etag: string | null;
  lastModified: string | null;
}

export interface RawItemState {
  id: string;
  externalId: string;
  contentHash: string;
  /** Rejected rows must be re-parsed even when their factual hash is stable. */
  processingStatus: "new" | "parsed" | "rejected" | "superseded";
  /** Extraction snapshot from the stored payload, for change classification. */
  extraction: ExtractedOffer | null;
  /** Version-2 compound snapshot; old rows fall back to `extraction`. */
  extractions?: ExtractedOffer[];
  /** Non-terminal candidate already open for this item, if any. */
  openCandidateId: string | null;
  /** Approved offer previously produced from this item, if any. */
  approvedOfferId: string | null;
  candidateLinks?: Array<{
    subOfferKey: string;
    openCandidateId: string | null;
    approvedOfferId: string | null;
  }>;
}

export interface StagedCandidate {
  rawItemId: string;
  extraction: ExtractedOffer;
  changeKind: ChangeKind | null;
  changedFields: string[];
  /** Optional structured before/after evidence for reconciliation review. */
  fieldDiff?: Array<{ field: string; before: unknown; after: unknown }>;
  reviewStatus: "new" | "changed";
}

export interface IngestMetrics {
  status: "ok" | "partial" | "error";
  fetchStatus: string;
  itemsSeen: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  itemsRejected: number;
  candidatesNew: number;
  candidatesChanged: number;
  snapshotHash: string | null;
  errors: string[];
}

export interface RunIngestDeps {
  now(): Date;
  /** Source adapter; absent preserves the GCDB RSS parser. */
  parseBody?(body: string): GcdbFeedItem[];
  parserVersion?: number;
  /** Optional approved structured-data adapter for compound source children. */
  extractItem?(item: GcdbFeedItem): ExtractedOffer[];
  /** Bounded, allowlisted conditional GET. */
  fetchFeed(config: IngestSourceConfig): Promise<
    | { kind: "ok"; body: string; etag: string | null; lastModified: string | null }
    | { kind: "not-modified" }
    | { kind: "blocked" | "error"; reason: string }
  >;
  /** Existing raw-item state for the fetched external ids. */
  loadRawItems(sourceId: string, externalIds: string[]): Promise<RawItemState[]>;
  /** Insert a new raw item; returns its id. */
  insertRawItem(sourceId: string, item: GcdbFeedItem, contentHash: string, extractions: ExtractedOffer[], parserVersion: number, now: Date): Promise<string>;
  /** Update a changed raw item in place (content, hash, extraction, last_seen). */
  updateRawItem(id: string, item: GcdbFeedItem, contentHash: string, extractions: ExtractedOffer[], parserVersion: number, now: Date): Promise<void>;
  /**
   * Retain a bounded source item whose extraction failed. Existing open review
   * candidates for the same raw row are superseded; approved offers are never
   * touched. The adapter must be idempotent on (source_id, external_id).
   */
  persistRejectedRawItem(
    sourceId: string,
    item: GcdbFeedItem,
    contentHash: string,
    parserVersion: number,
    parserError: string,
    now: Date,
    existingRawItemId: string | null,
  ): Promise<string>;
  /** Bump last_seen on an unchanged item. */
  touchRawItem(id: string, now: Date): Promise<void>;
  /** Stage a review candidate (supersedes any open one for the item). */
  stageCandidate(sourceId: string, candidate: StagedCandidate): Promise<void>;
  /** Persist the source's conditional-GET state after a successful fetch. */
  recordSourceState(sourceId: string, patch: { etag: string | null; lastModified: string | null; ok: boolean; error?: string }, now: Date): Promise<void>;
}

export interface RunIngestConfig {
  maxItems: number;
}

/** Stable content hash over the item's factual fields (order-independent). */
export function contentHashOf(
  item: GcdbFeedItem,
  parserVersion: number = GCDB_PARSER_VERSION,
): string {
  const basis = [
    `parser:${parserVersion}`,
    `extractor:${EXTRACTOR_VERSION}`,
    item.title,
    item.canonicalUrl,
    item.offerType ?? "",
    item.sellerName ?? "",
    [...item.giftCardBrands].sort().join("|"),
    item.startsAt ?? "",
    item.endsAt ?? "",
    item.isOngoing ? "ongoing" : "",
    item.sourceMarkedExpired ? "expired" : "",
    item.excerpt,
    item.weeklyFacts ? JSON.stringify(item.weeklyFacts) : "",
  ].join("");
  return createHash("sha256").update(basis).digest("hex");
}

export { EXTRACTOR_VERSION };

export async function runGiftCardIngest(
  source: IngestSourceConfig,
  config: RunIngestConfig,
  deps: RunIngestDeps
): Promise<IngestMetrics> {
  const errors: string[] = [];
  const metrics: IngestMetrics = {
    status: "ok",
    fetchStatus: "ok",
    itemsSeen: 0,
    itemsNew: 0,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    itemsRejected: 0,
    candidatesNew: 0,
    candidatesChanged: 0,
    snapshotHash: null,
    errors,
  };
  const now = deps.now();
  const parserVersion = deps.parserVersion ?? GCDB_PARSER_VERSION;

  const fetched = await deps.fetchFeed(source);
  if (fetched.kind === "not-modified") {
    metrics.fetchStatus = "not-modified";
    await deps.recordSourceState(source.id, { etag: source.etag, lastModified: source.lastModified, ok: true }, now);
    return metrics;
  }
  if (fetched.kind !== "ok") {
    metrics.status = "error";
    metrics.fetchStatus = fetched.kind;
    errors.push(fetched.reason);
    await deps.recordSourceState(
      source.id,
      { etag: source.etag, lastModified: source.lastModified, ok: false, error: fetched.reason },
      now
    );
    return metrics;
  }

  metrics.snapshotHash = createHash("sha256").update(fetched.body).digest("hex");
  let parsedItems: GcdbFeedItem[];
  try {
    parsedItems = deps.parseBody?.(fetched.body) ?? parseGcdbFeed(fetched.body);
  } catch (error) {
    const message = `Source parse failed: ${error instanceof Error ? error.message : String(error)}`;
    metrics.status = "error";
    metrics.fetchStatus = "parse-error";
    errors.push(message);
    await deps.recordSourceState(
      source.id,
      {
        etag: source.etag,
        lastModified: source.lastModified,
        ok: false,
        error: message,
      },
      now,
    );
    return metrics;
  }
  if (parsedItems.length === 0) {
    const message = fetched.body.trim()
      ? "Source parse failed: non-empty response contained no parseable items."
      : "Source parse failed: upstream returned an empty response body.";
    metrics.status = "error";
    metrics.fetchStatus = "parse-error";
    errors.push(message);
    await deps.recordSourceState(
      source.id,
      {
        etag: source.etag,
        lastModified: source.lastModified,
        ok: false,
        error: message,
      },
      now,
    );
    return metrics;
  }
  const items = parsedItems.slice(0, Math.max(1, config.maxItems));
  metrics.itemsSeen = items.length;

  const existing = await deps.loadRawItems(source.id, items.map((i) => i.externalId));
  const byExternalId = new Map(existing.map((row) => [row.externalId, row]));

  for (const item of items) {
    const before = byExternalId.get(item.externalId);
    const hash = contentHashOf(item, parserVersion);
    let extractions: ExtractedOffer[];
    try {
      extractions = deps.extractItem?.(item) ?? extractOffers(item);
      if (extractions.length === 0) {
        throw new Error("No review candidates were extracted from the source item.");
      }
    } catch (error) {
      const parserError = error instanceof Error ? error.message : String(error);
      // Persistence is part of the safety boundary: if attribution cannot be
      // retained, throw so runGuarded records a failed run rather than claiming
      // a partial success with a silently dropped source item.
      await deps.persistRejectedRawItem(
        source.id,
        item,
        hash,
        parserVersion,
        parserError,
        now,
        before?.id ?? null,
      );
      metrics.itemsRejected++;
      errors.push(`${item.externalId}: ${parserError}`);
      continue;
    }

    if (!before) {
      const rawItemId = await deps.insertRawItem(
        source.id,
        item,
        hash,
        extractions,
        parserVersion,
        now,
      );
      for (const extraction of extractions) {
        await deps.stageCandidate(source.id, {
          rawItemId,
          extraction,
          changeKind: null,
          changedFields: [],
          reviewStatus: "new",
        });
      }
      metrics.itemsNew++;
      metrics.candidatesNew += extractions.length;
      continue;
    }

    if (before.contentHash === hash && before.processingStatus === "parsed") {
      await deps.touchRawItem(before.id, now);
      metrics.itemsUnchanged++;
      continue;
    }

    // Changed content, or a corrected retry of a rejected row: return the raw
    // item to parsed and stage fresh private review without touching public data.
    await deps.updateRawItem(
      before.id,
      item,
      hash,
      extractions,
      parserVersion,
      now,
    );
    metrics.itemsUpdated++;
    const priorExtractions =
      before.extractions ?? (before.extraction ? [before.extraction] : []);
    const priorByKey = new Map(
      priorExtractions.map((extraction) => [extraction.subOfferKey ?? "primary", extraction])
    );
    const links = new Map(
      (before.candidateLinks ?? [
        {
          subOfferKey: "primary",
          openCandidateId: before.openCandidateId,
          approvedOfferId: before.approvedOfferId,
        },
      ]).map((link) => [link.subOfferKey, link])
    );

    for (const extraction of extractions) {
      const previous = priorByKey.get(extraction.subOfferKey) ?? null;
      const link = links.get(extraction.subOfferKey);
      const change = previous ? classifyOfferChange(previous, extraction) : null;
      const linkedToApproved = link?.approvedOfferId != null;
      const needsCandidate =
        link?.openCandidateId != null ||
        !linkedToApproved ||
        (change?.requiresReview ?? true);
      if (!needsCandidate) continue;
      await deps.stageCandidate(source.id, {
        rawItemId: before.id,
        extraction,
        changeKind: change?.kind ?? null,
        changedFields: change?.changedFields ?? [],
        reviewStatus: linkedToApproved ? "changed" : "new",
      });
      if (linkedToApproved) metrics.candidatesChanged++;
      else metrics.candidatesNew++;
    }

    // A child is "removed" only because the parent was fetched and its key
    // disappeared. Falling out of the RSS window never reaches this branch.
    const currentKeys = new Set(extractions.map((extraction) => extraction.subOfferKey));
    for (const previous of priorExtractions) {
      if (currentKeys.has(previous.subOfferKey)) continue;
      const link = links.get(previous.subOfferKey);
      if (!link?.openCandidateId && !link?.approvedOfferId) continue;
      await deps.stageCandidate(source.id, {
        rawItemId: before.id,
        extraction: {
          ...previous,
          sourcePresence: "removed",
          warnings: [...previous.warnings, "Sub-offer removed from the fetched source item — review the linked offer."],
        },
        changeKind: "source-removed",
        changedFields: ["source"],
        reviewStatus: link.approvedOfferId ? "changed" : "new",
      });
      if (link.approvedOfferId) metrics.candidatesChanged++;
      else metrics.candidatesNew++;
    }
  }

  if (errors.length > 0) metrics.status = "partial";
  await deps.recordSourceState(
    source.id,
    errors.length > 0
      ? {
          // Preserve the prior conditional state so a partial parse receives
          // the full changed response again on its next idempotent retry.
          etag: source.etag,
          lastModified: source.lastModified,
          ok: false,
          error: errors.join("; ").slice(0, 500),
        }
      : { etag: fetched.etag, lastModified: fetched.lastModified, ok: true },
    now
  );
  return metrics;
}
