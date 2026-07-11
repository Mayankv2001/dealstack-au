import type { FeedItemInsert } from "@/lib/monitor/mapFeedItem";

export interface ExistingFeedItemState {
  sourceNativeId: string;
  contentHash: string | null;
  reviewState: string;
  link: string;
}

export interface FeedItemChange {
  item: FeedItemInsert;
  previousReviewState: string | null;
}

export function classifyFeedChanges(
  items: FeedItemInsert[],
  existing: ExistingFeedItemState[]
): {
  changes: FeedItemChange[];
  inserted: number;
  updated: number;
  skipped: number;
} {
  const previous = new Map(existing.map((row) => [row.sourceNativeId, row]));
  const existingHashes = new Set(
    existing.map((row) => row.contentHash).filter((hash): hash is string => !!hash)
  );
  const existingLinks = new Set(existing.map((row) => row.link).filter(Boolean));
  const handledNativeIds = new Set<string>();
  const changes: FeedItemChange[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const item of items) {
    // PostgreSQL cannot update the same conflict target twice in one upsert.
    // Keep the first occurrence deterministically if a malformed feed repeats a
    // native id with different content in the same parsed batch.
    if (handledNativeIds.has(item.source_native_id)) {
      skipped++;
      continue;
    }
    handledNativeIds.add(item.source_native_id);
    const before = previous.get(item.source_native_id);
    if (
      !before &&
      (existingHashes.has(item.content_hash) || existingLinks.has(item.link))
    ) {
      skipped++;
      continue;
    }
    if (before?.contentHash === item.content_hash) {
      skipped++;
      continue;
    }
    if (before) updated++;
    else inserted++;
    changes.push({ item, previousReviewState: before?.reviewState ?? null });
    existingHashes.add(item.content_hash);
    if (item.link) existingLinks.add(item.link);
  }
  return { changes, inserted, updated, skipped };
}
