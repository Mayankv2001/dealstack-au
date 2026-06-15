import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from("audit_log").insert({
      actor_email: event.actorEmail,
      action: event.action,
      table_name: event.tableName,
      row_id: event.rowId ?? null,
      diff: event.diff ?? null,
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

/** Optional filters for the audit list. */
export interface AuditFilter {
  tableName?: string;
  action?: string;
  limit?: number;
}

/** Latest audit events, newest first, optionally filtered by table / action. */
export async function listAuditLog(
  filter: AuditFilter = {}
): Promise<AuditEntry[]> {
  const db = getSupabaseAdmin();
  let query = db
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.tableName) query = query.eq("table_name", filter.tableName);
  if (filter.action) query = query.eq("action", filter.action);
  const { data, error } = await query;
  if (error) throw new Error(`listAuditLog failed: ${error.message}`);
  return ((data ?? []) as unknown as AuditRow[]).map(mapAudit);
}
