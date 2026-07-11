import type { MonitorRunSummary } from "@/lib/monitor/runMonitor";
import type {
  ArchiveSummary,
  PipelineRunPatch,
  StartRunOutcome,
  ValidationSummary,
} from "@/lib/admin/repos/dailyPipeline";

export interface DailyPipelineDeps {
  now: () => Date;
  startRun(startedAt: Date): Promise<StartRunOutcome>;
  finishRun(id: string, patch: PipelineRunPatch, finishedAt: Date): Promise<void>;
  archiveExpired(now: Date): Promise<ArchiveSummary>;
  validateLive(now: Date, userAgent: string): Promise<ValidationSummary>;
  fetchLatest(): Promise<MonitorRunSummary>;
  detectChanges?(): Promise<{
    scanned: number;
    detected: number;
    inserted: number;
  }>;
}

export interface DailyPipelineOptions {
  monitorEnabled: boolean;
  complianceApproved: boolean;
  userAgent: string | null;
  preflightErrors?: string[];
  detectionEnabled?: boolean;
}

export interface DailyPipelineSummary extends PipelineRunPatch {
  runId: string;
}

/**
 * `started: false` means another invocation currently holds the one-running
 * lock (migration 016) — this call did nothing: no archive, no validation, no
 * fetch, and no run row was written. The caller should treat that as a clean
 * skip, not an error.
 */
export type DailyPipelineOutcome =
  | { started: true; summary: DailyPipelineSummary }
  | { started: false; reason: "already-running" };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runDailyPipeline(
  options: DailyPipelineOptions,
  deps: DailyPipelineDeps
): Promise<DailyPipelineOutcome> {
  const startedAt = deps.now();
  const startOutcome = await deps.startRun(startedAt);
  if (!startOutcome.started) {
    return { started: false, reason: startOutcome.reason };
  }
  const runId = startOutcome.runId;
  const errors: string[] = [...(options.preflightErrors ?? [])];
  let expiredArchived = 0;
  let invalidArchived = 0;
  let staleArchived = 0;
  let cardOffersArchived = 0;
  let feedItemsRetired = 0;
  let feedItemsPurged = 0;
  let detectionScanned = 0;
  let detectionDetected = 0;
  let detectionInserted = 0;
  let validationChecked = 0;
  let validationUnknown = 0;
  let feedsProcessed = 0;
  let itemsFetched = 0;
  let itemsNew = 0;
  let itemsUpdated = 0;
  let itemsSkipped = 0;

  try {
    const cleanup = await deps.archiveExpired(startedAt);
    expiredArchived = cleanup.expired;
    staleArchived = cleanup.staleSignals;
    cardOffersArchived = cleanup.cardOffers;
    feedItemsRetired = cleanup.feedItemsRetired;
    feedItemsPurged = cleanup.feedItemsPurged;
  } catch (error) {
    errors.push(`expiry cleanup: ${message(error)}`);
  }

  let terminal: PipelineRunPatch["status"] | null = null;
  if (!options.monitorEnabled) terminal = "disabled";
  else if (!options.complianceApproved) {
    terminal = options.preflightErrors?.length ? "error" : "blocked";
  }
  else if (!options.userAgent) {
    terminal = "error";
    errors.push("validation/fetch: OZB_MONITOR_USER_AGENT is not configured");
  }

  if (!terminal) {
    try {
      const validation = await deps.validateLive(startedAt, options.userAgent!);
      invalidArchived = validation.archived;
      validationChecked = validation.checked;
      validationUnknown = validation.unknown;
    } catch (error) {
      errors.push(`live validation: ${message(error)}`);
    }

    try {
      const monitor = await deps.fetchLatest();
      feedsProcessed = monitor.feedsProcessed;
      for (const result of monitor.results) {
        itemsFetched += result.itemsSeen;
        itemsNew += result.itemsNew;
        itemsUpdated += result.itemsUpdated;
        itemsSkipped += result.itemsSkipped;
        if (result.error) errors.push(`${result.feedId}: ${result.error}`);
      }
    } catch (error) {
      errors.push(`feed fetch: ${message(error)}`);
    }

    if (options.detectionEnabled && deps.detectChanges) {
      try {
        const detection = await deps.detectChanges();
        detectionScanned = detection.scanned;
        detectionDetected = detection.detected;
        detectionInserted = detection.inserted;
      } catch (error) {
        errors.push(`offer detection: ${message(error)}`);
      }
    }
  }

  const status =
    terminal && errors.length === 0
      ? terminal
      : errors.length === 0
        ? "ok"
        : terminal === "error"
          ? "error"
          : "partial";
  const patch: PipelineRunPatch = {
    status,
    expiredArchived,
    invalidArchived,
    staleArchived,
    cardOffersArchived,
    feedItemsRetired,
    feedItemsPurged,
    detectionScanned,
    detectionDetected,
    detectionInserted,
    validationChecked,
    validationUnknown,
    feedsProcessed,
    itemsFetched,
    itemsNew,
    itemsUpdated,
    itemsSkipped,
    errors,
  };
  await deps.finishRun(runId, patch, deps.now());
  return { started: true, summary: { runId, ...patch } };
}
