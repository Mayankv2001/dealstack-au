import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const LOCK_NAME = "ozbargain-feed-monitor";
const LEASE_MS = 15 * 60 * 1000;

export interface MonitorLock {
  holderId: string;
}

/** Acquire a short lease; null means another monitor invocation owns it. */
export async function acquireMonitorLock(
  now: Date = new Date()
): Promise<MonitorLock | null> {
  const db = getSupabaseAdmin();
  const nowIso = now.toISOString();

  // A crashed invocation cannot block the monitor forever.
  const { error: cleanupError } = await db
    .from("monitor_locks")
    .delete()
    .eq("name", LOCK_NAME)
    .lt("expires_at", nowIso);
  if (cleanupError) {
    throw new Error(`monitor lock cleanup failed: ${cleanupError.message}`);
  }

  const holderId = randomUUID();
  const { error } = await db.from("monitor_locks").insert({
    name: LOCK_NAME,
    holder_id: holderId,
    acquired_at: nowIso,
    expires_at: new Date(now.getTime() + LEASE_MS).toISOString(),
  });
  if (!error) return { holderId };
  if ((error as { code?: string }).code === "23505") return null;
  throw new Error(`monitor lock acquisition failed: ${error.message}`);
}

/** Release only the lease owned by this invocation. */
export async function releaseMonitorLock(lock: MonitorLock): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("monitor_locks")
    .delete()
    .eq("name", LOCK_NAME)
    .eq("holder_id", lock.holderId);
  if (error) throw new Error(`monitor lock release failed: ${error.message}`);
}
