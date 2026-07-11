import { isMonitorStale, MONITOR_STALE_HOURS } from "./staleness";

export interface MonitorHealthInput {
  envEnabled: boolean;
  complianceApproved: boolean;
  fetchableEnabledFeedCount: number;
  lastSuccessAt: string | null;
  now: Date;
  pipelineExpected?: boolean;
  latestPipelineAt?: string | null;
  latestPipelineStatus?: string | null;
  runningPipelineStartedAt?: string | null;
  consecutiveParserFailures?: number;
  autoDisabledFeedCount?: number;
  fetchAnomaly?: "zero-collapse" | "spike" | null;
  duplicateRunCount?: number;
}

export interface FetchHealthRow {
  feedSourceId: string;
  error: string | null;
  itemsSeen: number | null;
}

export interface FetchHealthSummary {
  consecutiveParserFailures: number;
  fetchAnomaly: "zero-collapse" | "spike" | null;
}

/** Summarise newest-first fetch logs independently for each feed source. */
export function summarizeFetchHealth(
  rows: FetchHealthRow[]
): FetchHealthSummary {
  const bySource = new Map<string, FetchHealthRow[]>();
  for (const row of rows) {
    const sourceRows = bySource.get(row.feedSourceId) ?? [];
    sourceRows.push(row);
    bySource.set(row.feedSourceId, sourceRows);
  }

  let consecutiveParserFailures = 0;
  let fetchAnomaly: FetchHealthSummary["fetchAnomaly"] = null;
  for (const sourceRows of bySource.values()) {
    let parserFailures = 0;
    for (const row of sourceRows) {
      if (!row.error?.includes("feed XML parse failed")) break;
      parserFailures++;
    }
    consecutiveParserFailures = Math.max(
      consecutiveParserFailures,
      parserFailures
    );

    const successfulCounts = sourceRows
      .filter((row) => row.error === null)
      .map((row) => Number(row.itemsSeen ?? 0));
    const latestCount = successfulCounts[0];
    const prior = successfulCounts.slice(1);
    const priorAverage =
      prior.length > 0
        ? prior.reduce((sum, value) => sum + value, 0) / prior.length
        : 0;
    if (latestCount === 0 && priorAverage > 0) {
      fetchAnomaly = "zero-collapse";
    } else if (
      fetchAnomaly === null &&
      latestCount != null &&
      priorAverage > 0 &&
      latestCount > Math.max(20, priorAverage * 10)
    ) {
      fetchAnomaly = "spike";
    }
  }

  return { consecutiveParserFailures, fetchAnomaly };
}

export type MonitorHealth =
  | { ok: true; monitoring: "off" | "paused" }
  | { ok: true; monitoring: "on"; lastSuccessAt: string }
  | { ok: false; reason: "compliance" }
  | {
      ok: false;
      reason: "stale";
      stale: true;
      lastSuccessAt: string | null;
      thresholdHours: number;
    }
  | {
      ok: false;
      reason:
        | "pipeline-stale"
        | "pipeline-stuck"
        | "pipeline-failed"
        | "parser-failures"
        | "feeds-auto-disabled"
        | "fetch-anomaly"
        | "duplicate-runs";
      detail: string;
    };

const PIPELINE_STALE_HOURS = 26;
const PIPELINE_STUCK_MINUTES = 30;

function ageMs(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? now.getTime() - parsed : null;
}

export function deriveMonitorHealth(input: MonitorHealthInput): MonitorHealth {
  if (input.pipelineExpected) {
    const runningAge = ageMs(input.runningPipelineStartedAt, input.now);
    if (
      runningAge !== null &&
      runningAge >= PIPELINE_STUCK_MINUTES * 60 * 1000
    ) {
      return {
        ok: false,
        reason: "pipeline-stuck",
        detail: `A pipeline run has remained running for at least ${PIPELINE_STUCK_MINUTES} minutes.`,
      };
    }
    const pipelineAge = ageMs(input.latestPipelineAt, input.now);
    if (
      pipelineAge === null ||
      pipelineAge >= PIPELINE_STALE_HOURS * 60 * 60 * 1000
    ) {
      return {
        ok: false,
        reason: "pipeline-stale",
        detail: `No daily pipeline run completed within ${PIPELINE_STALE_HOURS} hours.`,
      };
    }
    if (["error", "partial"].includes(input.latestPipelineStatus ?? "")) {
      return {
        ok: false,
        reason: "pipeline-failed",
        detail: `Latest pipeline status is ${input.latestPipelineStatus}.`,
      };
    }
    if ((input.consecutiveParserFailures ?? 0) >= 3) {
      return {
        ok: false,
        reason: "parser-failures",
        detail: `${input.consecutiveParserFailures} consecutive feed parser failures.`,
      };
    }
    if ((input.autoDisabledFeedCount ?? 0) > 0) {
      return {
        ok: false,
        reason: "feeds-auto-disabled",
        detail: `${input.autoDisabledFeedCount} feed source(s) appear auto-disabled.`,
      };
    }
    if (input.fetchAnomaly) {
      return {
        ok: false,
        reason: "fetch-anomaly",
        detail: `Latest fetch anomaly: ${input.fetchAnomaly}.`,
      };
    }
    if ((input.duplicateRunCount ?? 0) > 0) {
      return {
        ok: false,
        reason: "duplicate-runs",
        detail: `${input.duplicateRunCount} recent pipeline runs started less than five minutes apart.`,
      };
    }
  }
  if (!input.envEnabled) return { ok: true, monitoring: "off" };
  if (!input.complianceApproved) return { ok: false, reason: "compliance" };
  if (input.fetchableEnabledFeedCount === 0) {
    return { ok: true, monitoring: "paused" };
  }
  if (
    isMonitorStale({
      fetchableEnabledFeedCount: input.fetchableEnabledFeedCount,
      lastSuccessAt: input.lastSuccessAt,
      now: input.now,
    })
  ) {
    return {
      ok: false,
      reason: "stale",
      stale: true,
      lastSuccessAt: input.lastSuccessAt,
      thresholdHours: MONITOR_STALE_HOURS,
    };
  }
  return { ok: true, monitoring: "on", lastSuccessAt: input.lastSuccessAt! };
}
