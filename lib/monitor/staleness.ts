/**
 * Monitor staleness check — pure. The monitor is "stale" when we EXPECT runs
 * (at least one enabled, fetch-approved feed) but the last successful fetch
 * is older than the threshold. With a daily Vercel cron plus an optional
 * 3-hourly external scheduler, 30h tolerates one missed daily run without
 * flapping. No successful run ever (null) counts as stale when feeds expect
 * fetching.
 */
export const MONITOR_STALE_HOURS = 30;

export function isMonitorStale(opts: {
  fetchableEnabledFeedCount: number;
  lastSuccessAt: string | null; // ISO timestamp of last status='ok' fetch log
  now: Date;
  thresholdHours?: number;
}): boolean {
  if (opts.fetchableEnabledFeedCount === 0) return false;
  const threshold = (opts.thresholdHours ?? MONITOR_STALE_HOURS) * 3_600_000;
  if (opts.lastSuccessAt == null) return true;
  const age = opts.now.getTime() - Date.parse(opts.lastSuccessAt);
  return !(age < threshold); // NaN-safe: unparseable timestamp counts as stale
}
