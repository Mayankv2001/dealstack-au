/**
 * Safe cleanup of old / expired deal data.
 *
 * This script NEVER deletes rows. It only flips status columns so genuinely
 * expired data stops being public, mirroring exactly the checks the admin
 * dashboard data-quality report (lib/admin/repos/dashboard.ts) already surfaces
 * read-only. It acts on what that report flags:
 *
 *   - cashback / gift-card / points offers that are published but whose
 *     expiry_date is in the past  →  is_published = false   (unpublish)
 *   - weekly_deals that are published but expired             →  unpublish
 *   - ozbargain_signals (approved OR pending) whose expiry_date is in the past
 *                                                            →  status = 'expired'
 *   - staged feed_items (review_state = 'new') older than --stale-feed-days
 *                                                            →  review_state = 'ignored'
 *
 * It also REPORTS (never modifies) published offers that have no expiry_date,
 * because those need a human decision — see the project rule "missing expiry +
 * stale → flag, do not auto-delete".
 *
 * It also REPORTS (never modifies) published rows whose text still carries
 * demo/illustrative wording (see lib/admin/placeholderCopy.ts) — replacing
 * that copy with verified real offer details is a human admin task.
 *
 * SAFETY
 *   - Default is DRY-RUN: it prints exactly what it would change and writes
 *     nothing. Pass --write to apply.
 *   - It only ever UPDATEs is_published / status / review_state. No DELETE,
 *     ever. No publishing (it only un-publishes / expires / ignores).
 *   - Idempotent: the filters exclude already-actioned rows, so re-running finds
 *     nothing new.
 *   - Service-role, server-side only (same key as the seed script). No scraping,
 *     no external calls — it talks only to our own Supabase project.
 *   - Every applied change writes a best-effort row to the existing `audit_log`
 *     table (actor_email = 'script:cleanup-old-deals') so the audit trail stays
 *     intact. An audit-write failure is logged but never aborts the run.
 *
 * Required env (.env.local, same as `npm run seed`):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   npm run cleanup:old-deals            # dry-run (default) — prints, writes nothing
 *   npm run cleanup:old-deals -- --write # apply the changes
 *   npm run cleanup:old-deals -- --stale-feed-days=45   # tune the staged-item window
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "../lib/env";
import { findPlaceholderMarkers } from "../lib/admin/placeholderCopy";

// Load .env.local for standalone runs (Next loads it for the app, scripts don't).
type WithLoadEnv = { loadEnvFile?: (path?: string) => void };
try {
  (process as unknown as WithLoadEnv).loadEnvFile?.(".env.local");
} catch {
  // .env.local not found — fall back to shell-provided environment variables.
}

// ── CLI args ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
/** Staged feed items older than this many days are considered abandoned. */
const STALE_FEED_DAYS = parseStaleDays(argv) ?? 60;

function parseStaleDays(args: string[]): number | null {
  const arg = args.find((a) => a.startsWith("--stale-feed-days="));
  if (!arg) return null;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    [
      "cleanup-old-deals — unpublish/expire/ignore old deal data (never deletes).",
      "",
      "  npm run cleanup:old-deals                  dry-run (default)",
      "  npm run cleanup:old-deals -- --write       apply changes",
      "  npm run cleanup:old-deals -- --stale-feed-days=45",
      "",
      "Dry-run prints every candidate and writes nothing.",
    ].join("\n")
  );
  process.exit(0);
}

// ── Dates ────────────────────────────────────────────────────────────────────

// AU-local "today" as YYYY-MM-DD so it compares directly to a `date` column,
// matching the dashboard data-quality report's semantics exactly.
const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TODAY = DAY_FMT.format(new Date());
/** ISO cutoff for staged-feed staleness (timestamptz column → ISO compare). */
const STALE_FEED_CUTOFF_ISO = new Date(
  Date.now() - STALE_FEED_DAYS * 86_400_000
).toISOString();

// ── Supabase service-role client (server/script only) ────────────────────────

const db: SupabaseClient = createClient(supabaseUrl(), supabaseServiceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Audit (best-effort; never throws, mirrors lib/admin/repos/audit.ts) ───────

async function audit(
  action: string,
  table: string,
  rowId: string,
  diff: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await db.from("audit_log").insert({
      actor_email: "script:cleanup-old-deals",
      action,
      table_name: table,
      row_id: rowId,
      diff,
    });
    if (error) console.warn(`  [audit] write failed: ${error.message}`);
  } catch (err) {
    console.warn(
      `  [audit] write threw: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  detail: string;
}

let totalCandidates = 0;
let totalApplied = 0;

/**
 * Unpublish every published, expired row in an is_published table by setting
 * is_published = false. Reports first; only writes when --write is set.
 */
async function unpublishExpired(
  table:
    | "cashback_offers"
    | "gift_card_offers"
    | "points_offers"
    | "weekly_deals"
    | "card_offers",
  labelFor: (r: Record<string, unknown>) => string
): Promise<void> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("is_published", true)
    .not("expiry_date", "is", null)
    .lt("expiry_date", TODAY);
  if (error) throw new Error(`read ${table} failed: ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const candidates: Candidate[] = rows.map((r) => ({
    id: String(r.id),
    detail: `${labelFor(r)} — expired ${String(r.expiry_date)}`,
  }));
  printSection(`${table}: published but expired → unpublish`, candidates);
  totalCandidates += candidates.length;

  if (!WRITE) return;
  for (const r of rows) {
    const id = String(r.id);
    const { error: upErr } = await db
      .from(table)
      .update({ is_published: false })
      .eq("id", id);
    if (upErr) {
      console.warn(`  ✗ ${id}: update failed — ${upErr.message}`);
      continue;
    }
    await audit("auto-unpublish-expired", table, id, {
      reason: `expired ${String(r.expiry_date)} < ${TODAY}`,
      before: { is_published: true },
      after: { is_published: false },
    });
    totalApplied += 1;
    console.log(`  ✓ unpublished ${id}`);
  }
}

/** Expire approved/pending signals whose expiry_date has passed. */
async function expireSignals(): Promise<void> {
  const { data, error } = await db
    .from("ozbargain_signals")
    .select("id, title, status, expiry_date")
    .in("status", ["approved", "pending"])
    .not("expiry_date", "is", null)
    .lt("expiry_date", TODAY);
  if (error) throw new Error(`read ozbargain_signals failed: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    title: string;
    status: string;
    expiry_date: string;
  }[];
  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    detail: `[${r.status}] ${r.title} — expired ${r.expiry_date}`,
  }));
  printSection("ozbargain_signals: expired → status='expired'", candidates);
  totalCandidates += candidates.length;

  if (!WRITE) return;
  for (const r of rows) {
    const { error: upErr } = await db
      .from("ozbargain_signals")
      .update({ status: "expired" })
      .eq("id", r.id);
    if (upErr) {
      console.warn(`  ✗ ${r.id}: update failed — ${upErr.message}`);
      continue;
    }
    await audit("auto-expire-signal", "ozbargain_signals", r.id, {
      reason: `expired ${r.expiry_date} < ${TODAY}`,
      before: { status: r.status },
      after: { status: "expired" },
    });
    totalApplied += 1;
    console.log(`  ✓ expired ${r.id}`);
  }
}

/** Mark abandoned staged feed items (review_state='new', very old) as ignored. */
async function ignoreStaleFeedItems(): Promise<void> {
  const { data, error } = await db
    .from("feed_items")
    .select("id, raw_title, posted_at")
    .eq("review_state", "new")
    .not("posted_at", "is", null)
    .lt("posted_at", STALE_FEED_CUTOFF_ISO);
  if (error) throw new Error(`read feed_items failed: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    raw_title: string;
    posted_at: string;
  }[];
  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    detail: `${r.raw_title} — posted ${r.posted_at.slice(0, 10)}`,
  }));
  printSection(
    `feed_items: staged 'new' older than ${STALE_FEED_DAYS}d → ignored`,
    candidates
  );
  totalCandidates += candidates.length;

  if (!WRITE) return;
  for (const r of rows) {
    const { error: upErr } = await db
      .from("feed_items")
      .update({ review_state: "ignored" })
      .eq("id", r.id);
    if (upErr) {
      console.warn(`  ✗ ${r.id}: update failed — ${upErr.message}`);
      continue;
    }
    await audit("auto-ignore-stale-feed", "feed_items", r.id, {
      reason: `staged 'new' older than ${STALE_FEED_DAYS}d (posted ${r.posted_at})`,
      before: { review_state: "new" },
      after: { review_state: "ignored" },
    });
    totalApplied += 1;
    console.log(`  ✓ ignored ${r.id}`);
  }
}

/**
 * REPORT ONLY — never modifies. Published offers with no expiry_date can't be
 * auto-expired safely (they may be intentionally evergreen, e.g. base earn
 * rates). Surface them so an admin can decide.
 */
async function flagPublishedNoExpiry(
  table:
    | "cashback_offers"
    | "gift_card_offers"
    | "points_offers"
    | "card_offers",
  labelFor: (r: Record<string, unknown>) => string
): Promise<void> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("is_published", true)
    .is("expiry_date", null);
  if (error) throw new Error(`read ${table} failed: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return;
  console.log(`\n⚑ ${table}: published with NO expiry_date (review manually, not changed):`);
  for (const r of rows) {
    console.log(`    · ${String(r.id)} — ${labelFor(r)}`);
  }
}

/**
 * REPORT ONLY — never modifies. Published rows whose text still carries
 * demo/illustrative wording (e.g. "Illustrative sign-up bonus: …") need a
 * human to replace the copy with verified real offer details — see
 * lib/admin/placeholderCopy.ts and the "Placeholder copy" dashboard check
 * this mirrors.
 */
async function flagPlaceholderCopy(
  table:
    | "cashback_offers"
    | "gift_card_offers"
    | "points_offers"
    | "card_offers"
    | "weekly_deals",
  labelFor: (r: Record<string, unknown>) => string,
  textsFor: (r: Record<string, unknown>) => (string | null)[]
): Promise<void> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("is_published", true);
  if (error) throw new Error(`read ${table} failed: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  const hits = rows
    .map((r) => ({ r, markers: findPlaceholderMarkers(textsFor(r)) }))
    .filter(({ markers }) => markers.length > 0);
  if (hits.length === 0) return;
  console.log(`\n⚑ ${table}: published with placeholder copy (review manually, not changed):`);
  for (const { r, markers } of hits) {
    console.log(`    · ${String(r.id)} — ${labelFor(r)} — "${markers.join('", "')}"`);
  }
}

function printSection(title: string, candidates: Candidate[]): void {
  console.log(`\n▸ ${title}`);
  if (candidates.length === 0) {
    console.log("    (none)");
    return;
  }
  for (const c of candidates) {
    console.log(`    · ${c.id} — ${c.detail}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("DealStack AU — cleanup-old-deals");
  console.log(`  mode:            ${WRITE ? "WRITE (applying changes)" : "DRY-RUN (no changes)"}`);
  console.log(`  AU today:        ${TODAY}`);
  console.log(`  stale-feed-days: ${STALE_FEED_DAYS}`);

  const storeLabel = (r: Record<string, unknown>) =>
    String(r.merchant_id ?? r.brand ?? r.program ?? r.title ?? r.id);

  await unpublishExpired("cashback_offers", (r) => `${storeLabel(r)} · ${String(r.provider ?? "")}`);
  await unpublishExpired("gift_card_offers", (r) => String(r.brand ?? r.id));
  await unpublishExpired("points_offers", (r) => `${String(r.program ?? "")} · ${storeLabel(r)}`);
  await unpublishExpired("card_offers", (r) =>
    `${String(r.provider ?? "")} · ${String(r.card_name ?? r.id)}`
  );
  await unpublishExpired("weekly_deals", (r) => String(r.title ?? r.id));
  await expireSignals();
  await ignoreStaleFeedItems();

  // Report-only flags (never modified).
  await flagPublishedNoExpiry("cashback_offers", (r) => `${storeLabel(r)} · ${String(r.provider ?? "")}`);
  await flagPublishedNoExpiry("gift_card_offers", (r) => String(r.brand ?? r.id));
  await flagPublishedNoExpiry("points_offers", (r) => `${String(r.program ?? "")} · ${storeLabel(r)}`);
  await flagPublishedNoExpiry("card_offers", (r) =>
    `${String(r.provider ?? "")} · ${String(r.card_name ?? r.id)}`
  );

  await flagPlaceholderCopy(
    "cashback_offers",
    (r) => `${storeLabel(r)} · ${String(r.provider ?? "")}`,
    (r) => [r.terms_summary as string | null]
  );
  await flagPlaceholderCopy(
    "gift_card_offers",
    (r) => String(r.brand ?? r.id),
    (r) => [
      ...((r.usage_notes as string[] | null) ?? []),
      ...((r.stack_notes as string[] | null) ?? []),
    ]
  );
  await flagPlaceholderCopy(
    "points_offers",
    (r) => `${String(r.program ?? "")} · ${storeLabel(r)}`,
    (r) => [r.earn_rate_display as string | null]
  );
  await flagPlaceholderCopy(
    "card_offers",
    (r) => `${String(r.provider ?? "")} · ${String(r.card_name ?? r.id)}`,
    (r) => [
      r.offer_summary as string | null,
      r.eligibility_notes as string | null,
      r.card_name as string | null,
    ]
  );
  await flagPlaceholderCopy(
    "weekly_deals",
    (r) => String(r.title ?? r.id),
    (r) => [r.title as string | null, r.summary as string | null]
  );

  console.log("\n──────────────────────────────────────────");
  console.log(`  candidates found: ${totalCandidates}`);
  if (WRITE) {
    console.log(`  changes applied:  ${totalApplied}`);
  } else if (totalCandidates > 0) {
    console.log("  changes applied:  0 (dry-run) — re-run with -- --write to apply.");
  } else {
    console.log("  Nothing to clean — all published offers, signals and weekly deals are current.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
