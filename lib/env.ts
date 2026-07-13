/**
 * Centralised environment access.
 *
 * Helpers are lazy (functions, not top-level reads) so importing this module
 * never throws at build time when variables are absent — public pages keep
 * working via the static fallback, and only code that actually needs Supabase
 * (the seed script, future repos/admin actions) calls these.
 *
 * SECURITY: `supabaseServiceRoleKey()` is for server/script use ONLY. Never
 * import it into a client component or expose it to the browser.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local (see .env.example) or your hosting provider.`
    );
  }
  return value;
}

/** True when both public Supabase vars are present (used to decide DB vs static). */
export function hasSupabaseEnv(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Public site origin for absolute URLs (metadata, sitemap, robots). Falls back
 * to localhost so local/dev builds never throw; set NEXT_PUBLIC_SITE_URL in
 * production.
 */
export const siteUrl = (): string =>
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const supabaseUrl = (): string =>
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");

export const supabaseAnonKey = (): string =>
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/** SERVER/SCRIPT ONLY — never reference from client code. */
export const supabaseServiceRoleKey = (): string =>
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

/**
 * Shared secret the monitor cron route checks (Authorization: Bearer …). Vercel
 * Cron sends it automatically when CRON_SECRET is set in the project env. This
 * is an OPTIONAL, non-throwing read: null when unset/blank, so the route can
 * refuse to run (503) instead of throwing. SERVER ONLY — never expose the value
 * in any response, and never prefix with NEXT_PUBLIC_.
 */
export const cronSecret = (): string | null => {
  const value = process.env.CRON_SECRET;
  return value && value.trim() !== "" ? value : null;
};

/**
 * Optional ops webhook (e.g. Slack incoming webhook) that server-error reports
 * are POSTed to — see lib/observability/report-server-error.ts. Unset means
 * errors go to the function logs only. SERVER ONLY — never expose the URL and
 * never prefix with NEXT_PUBLIC_.
 */
export const alertWebhookUrl = (): string | null => {
  const value = process.env.ALERT_WEBHOOK_URL;
  return value && value.trim() !== "" ? value : null;
};

// ── OzBargain feed monitor (SERVER/SCRIPT ONLY) ──────────────────────────────
// All gated behind the master switch below. These are lazy reads (functions) so
// importing this module never throws; the monitor only calls them on its own
// code path, never from a request-handling page or public route.

/** Parse a positive-integer env var, falling back to a default when unset/invalid. */
function optionalPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

/** Parse a positive-number env var, falling back to a default when unset/invalid. */
function optionalPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Monitor master switch. Defaults to FALSE — true only when the value is exactly
 * "true". Off means zero outbound requests (checked at the top of the monitor).
 */
export const ozbMonitorEnabled = (): boolean =>
  process.env.OZB_MONITOR_ENABLED === "true";

/**
 * Identifying User-Agent (with a contact URL) sent on every feed request — never
 * a spoofed browser string. REQUIRED only when the monitor is enabled, so this
 * throws if missing; it is only ever read after ozbMonitorEnabled() is true.
 */
export const ozbMonitorUserAgent = (): string =>
  requireEnv("OZB_MONITOR_USER_AGENT");

/** Hard cap on feeds touched per daily run (default 10). */
export const ozbMonitorMaxFeedsPerRun = (): number =>
  optionalPositiveInt("OZB_MONITOR_MAX_FEEDS_PER_RUN", 10);

/** Floor on per-feed polling interval, in hours (default 12). */
export const ozbMonitorMinIntervalHours = (): number =>
  optionalPositiveNumber("OZB_MONITOR_MIN_INTERVAL_HOURS", 12);

/**
 * Offer-change DETECTION switch. Independent of, and additional to, the monitor
 * kill switch: this gates the post-run step that scans already-staged feed items
 * and stages `offer_change_candidates` for admin review. Defaults to FALSE — true
 * only when the value is exactly "true". Off means zero detection code runs and
 * the monitor behaves byte-identically to before. Never auto-applies anything.
 */
export const ozbOfferDetectEnabled = (): boolean =>
  process.env.OZB_OFFER_DETECT_ENABLED === "true";

/**
 * Card-offer DETECTION switch — INDEPENDENT of, and additional to,
 * OZB_OFFER_DETECT_ENABLED. Gates only the card_offer-typed detections within
 * that same step (lib/monitor/detectOffers.ts's detectCardOffer); the
 * existing cashback/gift_card/points detectors run exactly as before either
 * way. Defaults to FALSE — true only when the value is exactly "true".
 */
export const cardDetectEnabled = (): boolean =>
  process.env.CARD_DETECT_ENABLED === "true";

/** Maximum age of a successful live-signal validation before archival. */
export const signalValidationDays = (): number =>
  optionalPositiveInt("SIGNAL_VALIDATION_DAYS", 45);

// ── OzBargain expiry recheck (SERVER/SCRIPT ONLY) ────────────────────────────
// A SEPARATE, independently-gated job from the ingestion monitor. It revalidates
// PENDING review items against their OzBargain source post and archives the ones
// whose source is confirmed gone. Disabled by default — stays off until an
// operator flips it after production review. It still makes outbound HEAD
// requests to OzBargain, so the cron route also requires compliance approval and
// OZB_MONITOR_USER_AGENT before it does any network work.

/**
 * Expiry-recheck master switch. Defaults to FALSE — true only when the value is
 * exactly "true". Off means the recheck cron route does zero DB or network work.
 */
export const ozbExpiryRecheckEnabled = (): boolean =>
  process.env.OZB_EXPIRY_RECHECK_ENABLED === "true";

/**
 * Preview switch — DEFAULTS TO TRUE. In dry-run the recheck classifies and
 * records run metrics (including would-archive counts) but writes NOTHING: no
 * feed_items change, no archival, no audit. Real archival happens only when this
 * is explicitly set to "false" AFTER a preview run has been reviewed. A missing
 * or malformed value stays safe (true).
 */
export const ozbExpiryRecheckDryRun = (): boolean =>
  process.env.OZB_EXPIRY_RECHECK_DRY_RUN !== "false";

/** Items probed per recheck run — bounded to 25–50, default 40. */
export const ozbExpiryRecheckBatchSize = (): number => {
  const value = optionalPositiveInt("OZB_EXPIRY_RECHECK_BATCH_SIZE", 40);
  return Math.min(50, Math.max(25, value));
};

/** Floor on how often a single item may be re-probed, in hours (default 20). */
export const ozbExpiryRecheckMinIntervalHours = (): number =>
  optionalPositiveNumber("OZB_EXPIRY_RECHECK_MIN_INTERVAL_HOURS", 20);

// ── Gift-card ingest (GCDB) — SERVER/SCRIPT ONLY ─────────────────────────────
// A separate, independently-gated pipeline from the OzBargain monitor. Both
// the env master switch AND the gift_card_sources DB row must be enabled
// before any outbound request; absent configuration fails closed.

/** Gift-card ingest master switch. True only when exactly "true". */
export const gcdbIngestEnabled = (): boolean =>
  process.env.GCDB_INGEST_ENABLED === "true";

/** Feed URL override; the DB source row is the default. Empty → fail closed. */
export const gcdbRssUrl = (): string | null =>
  process.env.GCDB_RSS_URL?.trim() || null;

/**
 * Identifying User-Agent for GCDB requests. REQUIRED when the ingest is
 * enabled — never a spoofed browser string.
 */
export const gcdbUserAgent = (): string => {
  const value = process.env.GCDB_REQUEST_USER_AGENT?.trim();
  if (!value) {
    throw new Error(
      "GCDB_REQUEST_USER_AGENT is required when GCDB_INGEST_ENABLED=true."
    );
  }
  return value;
};

/** Hard cap on feed items processed per ingest run. */
export const gcdbMaxItemsPerRun = (): number =>
  optionalPositiveInt("GCDB_MAX_ITEMS_PER_RUN", 40);
