/**
 * Manual GCDB gift-card ingest runner (dry run by default).
 *
 * This is the operator-facing sibling of `scripts/monitor-feeds.ts`: it runs the
 * exact same `runGiftCardIngest()` core the daily cron
 * (app/api/cron/gift-card-ingest/route.ts) runs, against the enabled `gcdb`
 * source, conditionally GETs the allowlisted RSS feed, parses it and stages
 * REVIEW CANDIDATES only. Nothing here publishes — every candidate still awaits
 * admin approval through the hardened approve RPC.
 *
 * Why this exists: the OzBargain monitor has always had a manual runner; the
 * gift-card pipeline did not, so the only way to trigger an ingest was to wait
 * for the cron or invoke the deployed secret route (whose 40h interval guard a
 * manual `?force=1` does not bypass). This closes that parity gap with the same
 * safety posture the cron enforces.
 *
 * Safety (mirrors the cron gate chain, minus the Sydney-hour/interval cadence
 * which is a scheduling concern, not a safety one — an operator run is
 * deliberately off-cadence):
 *   - Kill switch: GCDB_INGEST_ENABLED must be exactly "true"; otherwise this
 *     exits immediately with NO fetch.
 *   - DB permission gate (decideAutomatedRetrieval): the `gcdb` source row must
 *     exist, be enabled, permit automated fetch, and carry completed terms +
 *     robots reviews. A --write run REFUSES unless the gate passes (fail-closed).
 *     A dry run without the gate is allowed for pre-approval testing, loudly.
 *   - GCDB_REQUEST_USER_AGENT must be set (identifying UA with a contact URL).
 *   - DRY RUN IS THE DEFAULT. Nothing is written unless you pass --write.
 *   - Writes (only with --write) touch ONLY gift_card_raw_items,
 *     gift_card_offer_candidates, gift_card_ingest_runs and the source
 *     poll-state — never gift_card_offers. A --write run also acquires the same
 *     migration-030 one-running lock and finalises through runGuardedIngest.
 *
 * Usage:
 *   npm run gift-card:ingest                        # dry run, whole feed
 *   npm run gift-card:ingest -- --write             # stage the whole feed
 *   npm run gift-card:ingest -- --only=12943,12944  # focus on specific offers
 *   npm run gift-card:ingest -- --only=12943 --write # stage just that offer
 *
 * --only=<external_id[,external_id...]> restricts the run to specific GCDB
 * offer ids (the WordPress post ids in the feed guids/links). It is a deliberate
 * operator subset: it filters the parsed feed BEFORE staging (the dedupe/content
 * hash logic is unchanged) and, in --write mode, deliberately does NOT advance
 * the source's conditional-GET cursor — otherwise the next full run would see a
 * 304 Not Modified and never process the items this subset skipped. Omit --only
 * for the exact whole-feed behaviour the daily cron performs.
 *

 * Required env (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (service-role; script only)
 *   GCDB_INGEST_ENABLED=true                              (kill switch)
 *   GCDB_REQUEST_USER_AGENT=...                           (required when enabled)
 *   GCDB_RSS_URL (optional override), GCDB_MAX_ITEMS_PER_RUN (default 40)
 */

import {
  gcdbIngestEnabled,
  gcdbMaxItemsPerRun,
  gcdbRssUrl,
  gcdbUserAgent,
} from "../lib/env";
import {
  finishIngestRun,
  failIngestRun,
  getGiftCardSource,
  insertRawItem,
  loadRawItems,
  persistRejectedRawItem,
  recordSourceState,
  stageCandidate,
  startIngestRun,
  touchRawItem,
  updateRawItem,
} from "../lib/admin/repos/giftCardPipeline";
import { decideAutomatedRetrieval } from "../lib/giftcards/sourceRetrievalPermission";
import {
  EXTRACTOR_VERSION,
  runGiftCardIngest,
  type IngestMetrics,
  type RunIngestDeps,
  type StagedCandidate,
} from "../lib/giftcards/runIngest";
import { runGuardedIngest } from "../lib/giftcards/runGuarded";
import { parseGcdbFeed } from "../lib/giftcards/parseGcdbFeed";
import { fetchFeed } from "../lib/monitor/fetchFeed";

// Load .env.local for standalone runs (Next loads it for the app; scripts don't).
type WithLoadEnv = { loadEnvFile?: (path?: string) => void };
try {
  (process as unknown as WithLoadEnv).loadEnvFile?.(".env.local");
} catch {
  // .env.local not found — fall back to shell-provided environment variables.
}

const SOURCE_ID = "gcdb";

interface CliArgs {
  dryRun: boolean;
  only: Set<string> | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  // Dry run is the default; only an explicit --write opts into persistence, and
  // --dry-run always wins if both are present.
  const dryRun = has("--dry-run") || !(has("--write") || has("--commit"));
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const ids = onlyArg
    ?.slice("--only=".length)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const only = ids && ids.length ? new Set(ids) : null;
  return { dryRun, only };
}

function modeBanner(dryRun: boolean): string {
  return dryRun
    ? ">>> DRY RUN — no writes (fetch + parse only). Pass --write to stage. <<<"
    : ">>> LIVE RUN (--write) — candidate staging writes are ENABLED. <<<";
}

/** Human-readable candidate line for the dry-run preview. */
function describeCandidate(c: StagedCandidate): string {
  const e = c.extraction;
  const value =
    e.pointsMultiplier != null
      ? `${e.pointsMultiplier}x ${e.pointsProgram ?? "points"}`
      : e.fixedPoints != null
        ? `${e.fixedPoints.toLocaleString("en-AU")} ${e.pointsProgram ?? "points"}`
        : e.discountPercent != null
          ? `${e.discountPercent}% off`
          : e.bonusPercent != null
            ? `${e.bonusPercent}% bonus value`
            : "(no value extracted)";
  const window =
    e.isOngoing ? "ongoing" : `${e.startsAt ?? "?"} → ${e.expiresAt ?? "?"}`;
  const warn = e.warnings.length ? `  ⚠ ${e.warnings.join("; ")}` : "";
  return `[${c.reviewStatus}] ${e.promotionType} · ${value} · ${e.sellerName ?? "?"} · ${window}${warn}`;
}

function printMetrics(metrics: IngestMetrics, dryRun: boolean): void {
  console.log("=".repeat(64));
  console.log(" GCDB gift-card ingest — manual run");
  console.log(` ${modeBanner(dryRun)}`);
  console.log("=".repeat(64));
  console.log(`status:          ${metrics.status}`);
  console.log(`fetch:           ${metrics.fetchStatus}`);
  console.log(`items seen:      ${metrics.itemsSeen}`);
  const verb = dryRun ? "would insert" : "inserted";
  console.log(`${verb} (new):  ${metrics.itemsNew}`);
  console.log(`updated:         ${metrics.itemsUpdated}`);
  console.log(`unchanged:       ${metrics.itemsUnchanged}`);
  console.log(`rejected:        ${metrics.itemsRejected}`);
  const stageVerb = dryRun ? "would stage" : "staged";
  console.log(`${stageVerb} new:   ${metrics.candidatesNew}`);
  console.log(`${stageVerb} chg:   ${metrics.candidatesChanged}`);
  if (metrics.errors.length) {
    console.log(`errors:          ${metrics.errors.join("; ")}`);
  }
}

async function main(): Promise<void> {
  const { dryRun, only } = parseArgs(process.argv);

  // Kill switch first — never even read the UA or touch the DB when off.
  if (!gcdbIngestEnabled()) {
    console.log("GCDB gift-card ingest: GCDB_INGEST_ENABLED is not 'true'.");
    console.log("Kill switch is OFF — exiting safely with no fetch.");
    return;
  }

  console.log(modeBanner(dryRun));
  if (only) {
    console.log(`Restricted to GCDB offer id(s): ${[...only].join(", ")}`);
  }

  const source = await getGiftCardSource(SOURCE_ID);
  const permission = decideAutomatedRetrieval(true, {
    sourceExists: source != null,
    enabled: source?.enabled ?? false,
    automatedFetchAllowed: source?.automated_fetch_allowed ?? false,
    termsCheckedAt: source?.terms_checked_at ?? null,
    robotsCheckedAt: source?.robots_checked_at ?? null,
  });
  if (!permission.allowed) {
    if (!dryRun) {
      console.error(
        `\nREFUSING write-mode run — source retrieval not permitted (${permission.reason}).\n` +
          "Enable the gcdb source with completed terms + robots reviews before staging.",
      );
      process.exitCode = 1;
      return;
    }
    console.warn(
      [
        "",
        "!".repeat(64),
        `!! WARNING: source retrieval gate is closed (${permission.reason}).`,
        "!! Proceeding ONLY because this is a dry run (fetch + parse, no writes).",
        "!! A --write run would refuse.",
        "!".repeat(64),
        "",
      ].join("\n"),
    );
  }
  if (!source) {
    console.error("The gcdb source row is missing; nothing to fetch.");
    process.exitCode = 1;
    return;
  }

  let userAgent: string;
  try {
    userAgent = gcdbUserAgent();
  } catch {
    console.error(
      "GCDB_REQUEST_USER_AGENT is required when the ingest is enabled. " +
        "Set an identifying UA with a contact URL (see .env.example).",
    );
    process.exitCode = 1;
    return;
  }

  const feedUrl = gcdbRssUrl() ?? source.feed_url;
  if (!feedUrl) {
    console.error("No feed URL configured for the gcdb source.");
    process.exitCode = 1;
    return;
  }

  // The fetch adapter is identical in dry-run and write mode — an operator dry
  // run performs the same allowlisted conditional GET the cron would, so the
  // preview reflects exactly what a --write run would stage.
  const fetchAdapter: RunIngestDeps["fetchFeed"] = async (config) => {
    const outcome = await fetchFeed({
      feedUrl: config.feedUrl,
      sourceType: SOURCE_ID,
      etag: config.etag,
      lastModified: config.lastModified,
      userAgent,
    });
    if (outcome.kind === "ok") {
      return {
        kind: "ok",
        body: outcome.body,
        etag: outcome.etag,
        lastModified: outcome.lastModified,
      };
    }
    if (outcome.kind === "not-modified") return { kind: "not-modified" };
    return { kind: outcome.kind, reason: outcome.reason };
  };

  const sourceConfig = {
    id: SOURCE_ID,
    feedUrl,
    etag: source.etag,
    lastModified: source.last_modified,
  };

  // --only filters the parsed feed to the requested offer ids via the ingest
  // core's own parseBody seam — the dedupe/hash/change logic downstream is
  // untouched; it simply operates over a smaller item set.
  const parseBody = only
    ? (body: string) =>
        parseGcdbFeed(body).filter((item) => only.has(item.externalId))
    : undefined;

  if (dryRun) {
    // No lock, no persistence: fetch + parse only, with in-memory writers that
    // record what WOULD be staged. Deliberately does NOT touch poll-state so a
    // dry run leaves the source's conditional-GET cursor untouched.
    const staged: StagedCandidate[] = [];
    const deps: RunIngestDeps = {
      now: () => new Date(),
      parseBody,
      fetchFeed: fetchAdapter,
      loadRawItems,
      insertRawItem: async (_s, item) => `dry-${item.externalId}`,
      updateRawItem: async () => {},
      persistRejectedRawItem: async (_s, item, _h, _v, _e, _t, existingId) =>
        existingId ?? `dry-${item.externalId}`,
      touchRawItem: async () => {},
      stageCandidate: async (_s, candidate) => {
        staged.push(candidate);
      },
      recordSourceState: async () => {},
    };
    const metrics = await runGiftCardIngest(
      sourceConfig,
      { maxItems: gcdbMaxItemsPerRun() },
      deps,
    );
    printMetrics(metrics, true);
    if (staged.length) {
      console.log("\nCandidates that WOULD be staged:");
      staged.forEach((c, i) => console.log(`  ${i + 1}. ${describeCandidate(c)}`));
    }
    console.log(
      "\nDRY RUN complete — nothing was written. Re-run with --write to stage for review.",
    );
    console.log(modeBanner(true));
    return;
  }

  // --write: the exact cron wiring — real service-role writers behind the
  // migration-030 lock, finalised through runGuardedIngest.
  const now = new Date();

  // A subset (--only) run must not advance the source's conditional-GET cursor:
  // the fetched body covers the WHOLE feed, so recording its new etag/
  // last-modified would make the next full run receive a 304 and silently skip
  // every item this subset did not process. On a subset run we therefore keep
  // the source's prior cursor (last_success_at still updates) so the next full
  // run re-fetches everything. A whole-feed run advances the cursor normally.
  const recordSourceStateAdapter: RunIngestDeps["recordSourceState"] = only
    ? (sourceId, patch, at) =>
        recordSourceState(
          sourceId,
          patch.ok
            ? { ...patch, etag: source.etag, lastModified: source.last_modified }
            : patch,
          at,
        )
    : recordSourceState;

  const deps: RunIngestDeps = {
    now: () => new Date(),
    parseBody,
    fetchFeed: fetchAdapter,
    loadRawItems,
    persistRejectedRawItem,
    insertRawItem,
    updateRawItem,
    touchRawItem,
    stageCandidate,
    recordSourceState: recordSourceStateAdapter,
  };

  let runId: string | null = null;
  const outcome = await runGuardedIngest({
    acquire: async () => {
      const start = await startIngestRun(SOURCE_ID, now);
      if (start.started) runId = start.runId;
      return start;
    },
    run: () =>
      runGiftCardIngest(sourceConfig, { maxItems: gcdbMaxItemsPerRun() }, deps),
    finish: (id, metrics) =>
      finishIngestRun(id, metrics, EXTRACTOR_VERSION, new Date()),
    fail: (id, message) => failIngestRun(id, message, new Date()),
    report: async (message) => {
      console.error(`operational report: ${message}`);
    },
  });

  if (outcome.ran === false) {
    console.log(`Run skipped: ${outcome.skipped} (another run holds the lock).`);
    return;
  }
  if ("failed" in outcome) {
    console.error("\nIngest failed — the run was finalised as 'error' and the lock released.");
    process.exitCode = 1;
    return;
  }

  printMetrics(outcome.metrics, false);
  console.log(
    `\nLIVE RUN complete — runId ${runId}. Review staged candidates at /admin/gift-cards/review. No offers were published.`,
  );
  console.log(modeBanner(false));
}

main().catch((err) => {
  console.error(
    "\nGCDB ingest run failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
