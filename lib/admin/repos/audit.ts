import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAdminAuditActor } from "@/lib/admin/audit-context";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Admin audit log — SERVICE-ROLE ONLY.
 *
 * Writes and reads the existing `audit_log` table (migration 001, RLS enabled
 * with no public policies). Like the other admin repos it uses getSupabaseAdmin()
 * and must only run on the server behind requireAdmin().
 *
 * Writes are BEST-EFFORT: logAudit() never throws, so a failed audit write can
 * never break the primary admin action it accompanies. There is no scraping /
 * fetching / external call here — it only talks to our own Supabase project.
 */

/** A single audit event to record. */
export interface AuditEvent {
  actorEmail: string | null;
  /** Short verb, e.g. "create", "update", "enable", "import". */
  action: string;
  /** The table the action touched, e.g. "feed_sources". */
  tableName: string;
  rowId?: string | null;
  /** Small, human-readable summary — NOT the full row. */
  diff?: Record<string, unknown> | null;
}

/** A row as the audit page sees it. */
export interface AuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  tableName: string;
  rowId: string | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  table_name: string;
  row_id: string | null;
  diff: Record<string, unknown> | null;
  created_at: string;
}

function mapAudit(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    actorEmail: r.actor_email,
    action: r.action,
    tableName: r.table_name,
    rowId: r.row_id,
    diff: r.diff,
    createdAt: r.created_at,
  };
}

/**
 * Record an admin action. Best-effort: any failure is swallowed (warn only) so
 * audit logging can never break the action it is recording. Call AFTER the
 * primary write succeeds and BEFORE any redirect().
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  // Admin mutations are audited transactionally by migration 011. Keep this
  // explicit path for scripts/cron calls, which intentionally have no request
  // actor context and therefore do not activate the trigger.
  if (getAdminAuditActor()) return;
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from("audit_log").insert({
      actor_email: event.actorEmail,
      action: event.action,
      table_name: event.tableName,
      row_id: event.rowId ?? null,
      diff: (event.diff ?? null) as Json,
    });
    if (error) {
      console.warn(`[audit] write failed: ${error.message}`);
    }
  } catch (err) {
    console.warn(
      `[audit] write threw: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Default number of audit rows shown per page. */
export const AUDIT_PAGE_SIZE = 50;

/** Optional filters for the audit list. */
export interface AuditFilter {
  tableName?: string;
  action?: string;
  /** Partial, case-insensitive match on actor_email. */
  actorEmail?: string;
  /** Partial, case-insensitive match on row_id. */
  rowId?: string;
  /** Zero-based offset for pagination. */
  offset?: number;
  /** Rows returned per page (defaults to AUDIT_PAGE_SIZE). */
  pageSize?: number;
}

/** A page of audit entries plus whether more rows exist beyond it. */
export interface AuditListResult {
  entries: AuditEntry[];
  hasMore: boolean;
}

/** Escape LIKE/ILIKE metacharacters so user input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * One page of audit events, newest first, optionally filtered by table, action,
 * actor email or row id. Pagination is offset-based; one extra row is fetched to
 * detect a next page without a separate count query. Read-only, service-role.
 */
export async function listAuditLog(
  filter: AuditFilter = {}
): Promise<AuditListResult> {
  const db = getSupabaseAdmin();
  const pageSize = filter.pageSize ?? AUDIT_PAGE_SIZE;
  const offset = Math.max(0, filter.offset ?? 0);

  let query = db
    .from("audit_log")
    .select("*")
    // Secondary sort on id keeps paging deterministic when timestamps tie.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize); // inclusive → pageSize + 1 rows
  if (filter.tableName) query = query.eq("table_name", filter.tableName);
  if (filter.action) query = query.eq("action", filter.action);
  if (filter.actorEmail) {
    query = query.ilike("actor_email", `%${escapeLike(filter.actorEmail)}%`);
  }
  if (filter.rowId) {
    query = query.ilike("row_id", `%${escapeLike(filter.rowId)}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listAuditLog failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as AuditRow[]).map(mapAudit);
  const hasMore = rows.length > pageSize;
  return { entries: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
}
