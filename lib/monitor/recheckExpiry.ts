import type { SourceStatus } from "./validateSourcePost";

/**
 * Pure decision logic for the OzBargain expiry-recheck job — no I/O, no clock
 * of its own, fully deterministic and unit-testable. It maps a single source
 * classification to exactly one action: archive, reset the failure streak, or
 * record another (non-archiving) failure.
 *
 * SAFETY INVARIANT: an item is archived ONLY on an explicit source state —
 *   • `deleted`  (confirmed 404/410 or an explicit deleted marker) → source_deleted
 *   • `expired`  (an explicit expired marker or a passed declared expiry, both
 *     captured from OzBargain's own feed XML at ingest — see
 *     classifyStoredSourceState below)                             → source_expired
 * Every ambiguous or transient result — `unknown` and `fetch_failed`, including
 * 403, 429, 5xx, timeouts, DNS/network failures, and anti-bot pages — KEEPS the
 * item in active Review. Repeated failures never archive; they only bump a
 * counter that surfaces as a monitor signal. There is no
 * "unavailable after N failures" archive path.
 */

export type ArchiveReason = "source_expired" | "source_deleted";

/**
 * Hours a source-declared expiry must have passed before it is trusted for
 * archival. OzBargain itself flips a deal to "expired" the moment its declared
 * expiry timestamp passes, but posters can extend a deal after we captured the
 * value — the margin absorbs those edits (an extension re-seen in the feed
 * refreshes our stored copy) plus any timezone/clock skew.
 */
export const DECLARED_EXPIRY_ARCHIVE_MARGIN_HOURS = 24;

/**
 * Structured source facts captured from the APPROVED OzBargain feed XML at
 * ingest time (lib/monitor/parseFeed + mapFeedItem) and stored on feed_items.
 * Consuming them costs ZERO additional outbound requests.
 */
export interface StoredSourceFacts {
  /** Feed carried `<ozb:title-msg type="expired">` when last (re-)ingested. */
  sourceMarkedExpired: boolean;
  /** `<ozb:meta expiry="…">` timestamp captured from the feed, if any. */
  declaredExpiresAt: Date | null;
}

export type StoredExpirySignal =
  /** The feed explicitly marked the deal expired/out-of-stock. */
  | "feed-expired-marker"
  /** The source-declared expiry passed more than the safety margin ago. */
  | "feed-declared-expiry-passed";

/**
 * Classify a pending item from its STORED feed facts alone. Returns the
 * expiry signal when the source is confidently expired, else null (meaning:
 * no stored evidence — fall through to the status-only HEAD probe).
 */
export function classifyStoredSourceState(
  facts: StoredSourceFacts,
  now: Date
): StoredExpirySignal | null {
  if (facts.sourceMarkedExpired) return "feed-expired-marker";
  if (facts.declaredExpiresAt) {
    const marginMs = DECLARED_EXPIRY_ARCHIVE_MARGIN_HOURS * 60 * 60 * 1000;
    if (now.getTime() - facts.declaredExpiresAt.getTime() >= marginMs) {
      return "feed-declared-expiry-passed";
    }
  }
  return null;
}

/** Accumulated per-item failure state read from feed_items. */
export interface RecheckItemState {
  consecutiveFailures: number;
  failureStreakStartedAt: Date | null;
}

export type RecheckDecision =
  | { action: "archive"; archiveReason: ArchiveReason; sourceStatus: SourceStatus }
  | { action: "reset"; sourceStatus: "active" }
  | {
      action: "record-failure";
      sourceStatus: SourceStatus;
      /** New consecutive-failure count to persist (observability only). */
      consecutiveFailures: number;
      /** Streak start to persist (unchanged if a streak was already running). */
      failureStreakStartedAt: Date;
    };

/** A transient/inconclusive result that must keep the item in review. */
export function isTransientStatus(status: SourceStatus): boolean {
  return status === "unknown" || status === "fetch_failed";
}

/**
 * Decide what to do with one pending item given its fresh classification.
 * `now` is injected so streak timestamps are testable to the millisecond.
 */
export function decideRecheckOutcome(
  item: RecheckItemState,
  status: SourceStatus,
  now: Date
): RecheckDecision {
  if (status === "active") {
    return { action: "reset", sourceStatus: "active" };
  }
  if (status === "deleted") {
    return {
      action: "archive",
      archiveReason: "source_deleted",
      sourceStatus: "deleted",
    };
  }
  if (status === "expired") {
    return {
      action: "archive",
      archiveReason: "source_expired",
      sourceStatus: "expired",
    };
  }

  // unknown | fetch_failed — transient/ambiguous. NEVER archive. Track the streak
  // purely for observability (a "this item keeps failing to validate" signal).
  const streakStart = item.failureStreakStartedAt ?? now;
  return {
    action: "record-failure",
    sourceStatus: status,
    consecutiveFailures: item.consecutiveFailures + 1,
    failureStreakStartedAt: streakStart,
  };
}
