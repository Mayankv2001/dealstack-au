import type { MonitorRunSummary } from "@/lib/monitor/runMonitor";
import type {
  ArchiveSummary,
  PipelineRunPatch,
  ValidationSummary,
} from "@/lib/admin/repos/dailyPipeline";

export interface DailyPipelineDeps {
  now: () => Date;
  startRun(startedAt: Date): Promise<string>;
  finishRun(id: string, patch: PipelineRunPatch, finishedAt: Date): Promise<void>;
  archiveExpired(now: Date): Promise<ArchiveSummary>;
  validateLive(now: Date, userAgent: string): Promise<ValidationSummary>;
  fetchLatest(): Promise<MonitorRunSummary>;
}

export interface DailyPipelineOptions {
  monitorEnabled: boolean;
  complianceApproved: boolean;
  userAgent: string | null;
  preflightErrors?: string[];
}

export interface DailyPipelineSummary extends PipelineRunPatch {
  runId: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runDailyPipeline(
  options: DailyPipelineOptions,
  deps: DailyPipelineDeps
): Promise<DailyPipelineSummary> {
  const startedAt = deps.now();
  const runId = await deps.startRun(startedAt);
  const errors: string[] = [...(options.preflightErrors ?? [])];
  let expiredArchived = 0;
  let invalidArchived = 0;
  let validationChecked = 0;
  let validationUnknown = 0;
  let feedsProcessed = 0;
  let itemsFetched = 0;
  let itemsNew = 0;
  let itemsUpdated = 0;
  let itemsSkipped = 0;

  try {
    expiredArchived = (await deps.archiveExpired(startedAt)).total;
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
  return { runId, ...patch };
}
