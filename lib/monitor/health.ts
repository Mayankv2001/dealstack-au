import { isMonitorStale, MONITOR_STALE_HOURS } from "./staleness";

export interface MonitorHealthInput {
  envEnabled: boolean;
  complianceApproved: boolean;
  fetchableEnabledFeedCount: number;
  lastSuccessAt: string | null;
  now: Date;
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
    };

export function deriveMonitorHealth(input: MonitorHealthInput): MonitorHealth {
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
