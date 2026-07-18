/**
 * Manual OzBargain feed monitor runner — Phase 1 (dry run by default).
 *
 * The FIRST and ONLY way to run the monitor today (no cron, no agent, no route).
 * It runs the shared runMonitor() core against the enabled, due feeds in
 * feed_sources, conditionally GETs each one, parses the RSS/Atom XML, and reports
 * what it found.
 *
 * Safety:
 *   - The master kill switch OZB_MONITOR_ENABLED must be exactly "true"; otherwise
 *     this exits immediately with NO fetch.
 *   - DRY RUN IS THE DEFAULT. Nothing is written unless you pass --write.
 *   - Only enabled feeds are fetched (concurrency 1, max 1 feed/run by default).
 *   - A blocked/HTML/Cloudflare-like response stops the run; no bypass.
 *   - Writes (only with --write) touch ONLY feed_items, feed_fetch_log, and
 *     feed_sources poll-state — NEVER ozbargain_signals. Imported signals still
 *     require manual admin approval via /admin/signals/queue.
 *
 * Usage:
 *   npm run monitor:feeds -- --dry-run
 *   npm run monitor:feeds -- --source=<feed_source_id> --dry-run
 *   npm run monitor:feeds -- --write            # actually stage feed_items
 *
 * Required env (in .env.local — see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (service-role; script only)
 *   OZB_MONITOR_ENABLED=true                              (kill switch)
 *   OZB_MONITOR_USER_AGENT=...                            (required when enabled)
 *   OZB_MONITOR_MAX_FEEDS_PER_RUN (default 1), OZB_MONITOR_MIN_INTERVAL_HOURS (default 12)
 */

import {
  ozbMonitorEnabled,
  ozbMonitorMaxFeedsPerRun,
  ozbMonitorMinIntervalHours,
  ozbMonitorUserAgent,
} from "../lib/env";
import { fetchFeed } from "../lib/monitor/fetchFeed";
import {
  runMonitor,
  type MonitorRunSummary,
} from "../lib/monitor/runMonitor";
import {
  insertFeedFetchLog,
  listDueEnabledFeeds,
  recordFeedPollState,
  upsertFeedItems,
} from "../lib/admin/repos/feedSources";

// Load .env.local for standalone runs (Next loads it for the app; scripts don't).
type WithLoadEnv = { loadEnvFile?: (path?: string) => void };
try {
  (process as unknown as WithLoadEnv).loadEnvFile?.(".env.local");
} catch {
  // .env.local not found — fall back to shell-provided environment variables.
}

interface CliArgs {
  dryRun: boolean;
  sourceId?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  const sourceArg = args.find((a) => a.startsWith("--source="));
  const sourceId = sourceArg?.slice("--source=".length).trim() || undefined;
  // Dry run is the default; only an explicit --write opts into persistence, and
  // --dry-run always wins if both are present.
  const dryRun = has("--dry-run") || !(has("--write") || has("--commit"));
  return { dryRun, sourceId };
}

/** A single, unmistakable mode line reused at the top and bottom of a run. */
function modeBanner(dryRun: boolean): string {
  return dryRun
    ? ">>> DRY RUN — no writes (fetch + parse only). Pass --write to stage. <<<"
    : ">>> LIVE RUN (--write) — staging writes are ENABLED. <<<";
}

function printSummary(summary: MonitorRunSummary): void {
  console.log("=".repeat(64));
  console.log(" OzBargain feed monitor — manual run");
  console.log(` ${modeBanner(summary.dryRun)}`);
  console.log("=".repeat(64));

  if (!summary.enabled) {
    console.log(summary.note ?? "Monitor disabled — nothing to do.");
    return;
  }
  if (summary.note) console.log(summary.note);

  console.log(`Feeds due/considered: ${summary.feedsConsidered}`);
  console.log(`Feeds processed:      ${summary.feedsProcessed}\n`);

  if (summary.results.length === 0) {
    console.log("No enabled, due feeds to fetch.");
  }

  summary.results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.label} [${r.status}]`);
    console.log(`   url:        ${r.feedUrl}`);
    console.log(`   http:       ${r.httpStatus ?? "—"}`);
    if (r.error) console.log(`   error:      ${r.error}`);
    if (r.status === "ok") {
      const verb = summary.dryRun ? "would stage" : "staged";
      console.log(`   items seen: ${r.itemsSeen}`);
      console.log(`   ${verb}:    ${r.itemsNew} new (deduped)`);
      r.sampleItems.forEach((s) =>
        console.log(`     - ${s.sourceNativeId}  ${s.rawTitle}`)
      );
    }
  });

  if (summary.dryRun) {
    console.log(
      "\nDRY RUN complete — nothing was written (no feed_items, poll-state, or fetch logs)."
    );
  } else {
    const staged = summary.results.reduce(
      (n, r) => n + (r.status === "ok" ? r.itemsNew : 0),
      0
    );
    console.log(
      `\nLIVE RUN complete — staged ${staged} new feed_item(s); poll-state + fetch log updated. No signals were published.`
    );
  }
  console.log(modeBanner(summary.dryRun));
}

async function main(): Promise<void> {
  const { dryRun, sourceId } = parseArgs(process.argv);

  // Kill switch first — never even read the UA or touch the DB when off.
  if (!ozbMonitorEnabled()) {
    console.log("OzBargain feed monitor: OZB_MONITOR_ENABLED is not 'true'.");
    console.log("Kill switch is OFF — exiting safely with no fetch.");
    return;
  }

  // State the mode up front, before any fetch — so it is obvious even if the
  // run later errors out mid-way.
  console.log(modeBanner(dryRun));

  let userAgent: string;
  try {
    userAgent = ozbMonitorUserAgent();
  } catch {
    console.error(
      "OZB_MONITOR_USER_AGENT is required when the monitor is enabled. " +
        "Set an identifying UA with a contact URL (see .env.example)."
    );
    process.exitCode = 1;
    return;
  }

  const summary = await runMonitor(
    { dryRun, sourceId },
    {
      config: {
        enabled: true,
        userAgent,
        maxFeedsPerRun: ozbMonitorMaxFeedsPerRun(),
        minIntervalHours: ozbMonitorMinIntervalHours(),
      },
      now: () => new Date(),
      fetchFeed,
      selectFeeds: listDueEnabledFeeds,
      // Persistence is only wired in for a live (--write) run.
      persistence: dryRun
        ? undefined
        : {
            upsertFeedItems,
            recordPollState: recordFeedPollState,
            insertFetchLog: insertFeedFetchLog,
          },
    }
  );

  printSummary(summary);
}

main().catch((err) => {
  console.error(
    "\nFeed monitor run failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
