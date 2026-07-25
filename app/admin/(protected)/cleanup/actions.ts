"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  checkAdminRateLimit,
  type AdminActionResult,
} from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import {
  applyUnpublishExpired,
  auToday,
  listCleanupCandidates,
  UNPUBLISH_TABLES,
  type UnpublishTable,
} from "@/lib/admin/repos/cleanup";

/**
 * Cleanup server actions — the reviewable, audited twin of
 * `scripts/cleanup-old-deals.ts --write`.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist), then consumes one
 * admin-rate-limit unit, applies a CONDITIONAL write in the repo (re-checks
 * eligibility), records an audit row, and revalidates the affected pages.
 *
 * These actions ONLY ever flip is_published=false — the same change as the
 * script. They NEVER delete and NEVER publish. Audit action names are prefixed `cleanup-*`
 * (vs the script's `auto-*`) so /admin/audit distinguishes a human click from a
 * CLI run. No scraping / fetching / external calls here.
 */

/** Backstop cap on a single bulk apply (mirrors the queue's BULK_IGNORE_MAX). */
const BULK_APPLY_MAX = 200;

/** Admin surfaces every cleanup change affects. */
function revalidateAdmin(): void {
  revalidatePath("/admin/cleanup");
  revalidatePath("/admin/dashboard");
}

/**
 * Public surfaces an unpublish/expire affects. Copies offer-changes'
 * revalidatePublicOffers and extends it with /cards (card offers render there),
 * /stores (the index), and the per-store page when a merchant_id is known.
 * Over-revalidation is harmless; a stale public page is not.
 */
function revalidatePublicOffers(merchantId: string | null): void {
  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath("/search");
  revalidatePath("/cards");
  revalidatePath("/stores");
  if (merchantId) revalidatePath(`/stores/${merchantId}`);
}

/** Guard: only the known offer tables can reach the write path. */
function isUnpublishTable(value: string): value is UnpublishTable {
  return (UNPUBLISH_TABLES as readonly string[]).includes(value);
}

// ── Per-row actions ────────────────────────────────────────────────────────────

/**
 * Unpublish one expired offer row (admin-confirmed). `merchantId` comes from the
 * server-rendered candidate and is used ONLY to revalidate that store's page —
 * it never reaches the DB write (which keys on id + the eligibility re-check), so
 * a tampered value can at worst mark an extra path stale.
 */
export async function unpublishExpiredAction(
  table: string,
  id: string,
  merchantId: string | null
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  if (!isUnpublishTable(table)) {
    return { error: "Unknown offer table." };
  }

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const today = auToday(new Date());
  try {
    await applyUnpublishExpired(table, id, today);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unpublish failed." };
  }
  await logAudit({
    actorEmail: email,
    action: "cleanup-unpublish-expired",
    tableName: table,
    rowId: id,
    diff: { before: { is_published: true }, after: { is_published: false }, today },
  });
  revalidateAdmin();
  revalidatePublicOffers(merchantId);
  return { ok: true };
}

// ── Bulk (per-section) action ───────────────────────────────────────────────────

export type CleanupSection = "expired-offers";

/**
 * Apply every currently-qualifying row in a section. Modelled on the queue's
 * ignoreVisibleItems: ONE rate-limit check for the batch, and the candidate
 * list is RE-DERIVED server-side (never trust client ids — "apply all" means
 * "all that qualify right now", which only the server knows). Per-row
 * "no longer eligible" errors are tolerated so one stale row can't abort the
 * batch. One summary audit row for the whole pass.
 */
export async function applySectionAction(
  section: CleanupSection
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  // One bulk pass counts as a single admin mutation against the limit.
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const now = new Date();
  const today = auToday(now);
  const candidates = await listCleanupCandidates(now);

  let applied = 0;
  let skipped = 0;
  const appliedIds: string[] = [];
  const affectedMerchants = new Set<string>();

  if (section === "expired-offers") {
    for (const c of candidates.expiredOffers.slice(0, BULK_APPLY_MAX)) {
      try {
        await applyUnpublishExpired(c.table, c.id, today);
        applied += 1;
        appliedIds.push(`${c.table}:${c.id}`);
        if (c.merchantId) affectedMerchants.add(c.merchantId);
      } catch {
        skipped += 1;
      }
    }
  } else {
    return { error: "Unknown cleanup section." };
  }

  const auditTable = "mixed_offer_tables";
  await logAudit({
    actorEmail: email,
    action: `cleanup-bulk-${section}`,
    tableName: auditTable,
    rowId: null,
    diff: { bulk: true, applied, skipped, ids: appliedIds.slice(0, 50) },
  });

  revalidateAdmin();
  revalidatePublicOffers(null);
  for (const merchantId of affectedMerchants) {
    revalidatePath(`/stores/${merchantId}`);
  }
  return { ok: true };
}
