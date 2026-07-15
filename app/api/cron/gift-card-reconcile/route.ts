import { timingSafeEqual } from "node:crypto";
import { cronSecret, giftCardReconcileEnabled, giftCardReconcileMinIntervalHours } from "@/lib/env";
import {
  startReconcileRun,
  lastReconcileRunStart,
} from "@/lib/admin/repos/giftCardReconcileRuns";
import { finishIngestRun, failIngestRun } from "@/lib/admin/repos/giftCardPipeline";
import { loadReconcileInputs } from "@/lib/admin/repos/giftCardReconcileData";
import { runGiftCardReconcile, type ReconcileMetrics } from "@/lib/giftcards/runReconcile";
import { runGuardedIngest } from "@/lib/giftcards/runGuarded";
import { reportOperationalError } from "@/lib/observability/report-server-error";
import {
  applyGiftCardLifecycle,
  isGiftCardLifecycleSchemaUnavailable,
  type LifecycleApplyResult,
} from "@/lib/admin/repos/giftCardLifecycle";
import { revalidateGiftCardLifecyclePaths } from "@/lib/giftcards/revalidateLifecycle";
import { isGiftCardJobRunSchemaUnavailable } from "@/lib/admin/repos/giftCardJobRunErrors";

/**
 * Daily gift-card reconciliation cron (TASK-05) — DEFAULT OFF.
 *
 * Gate order (each fails closed, none bypassable by `?force=1`):
 *   1. CRON_SECRET bearer (timing-safe; 503 if unset, 401 if wrong),
 *   2. GIFT_CARD_RECONCILE_ENABLED env flag (no DB/network when off),
 *   3. once-per-day interval guard (≥ GIFT_CARD_RECONCILE_MIN_INTERVAL_HOURS),
 *   4. source/kind lock via runGuardedIngest (030). Reconcile is additionally
 *      fenced against activate/archive, but independent ingest may overlap.
 * There is no run-hour gate (the daily slot's hour is non-critical), so
 * `?force=1` has nothing to bypass here — it must NEVER skip the interval
 * guard, auth, or the env flag. Reconciliation never fetches from a source.
 * Intentionally closed sources are omitted and never create false
 * `source-unavailable` work.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!giftCardReconcileEnabled()) {
    return Response.json({ ok: true, ran: false, skipped: "environment-disabled" });
  }

  const now = new Date();
  try {
    // Once-per-day interval guard (never bypassed by ?force=1).
    const lastStart = await lastReconcileRunStart();
    if (lastStart) {
      const hoursSince = (now.getTime() - lastStart.getTime()) / 3_600_000;
      if (hoursSince < giftCardReconcileMinIntervalHours()) {
        return Response.json({ ok: true, ran: false, skipped: "interval-guard" });
      }
    }

    let runId: string | null = null;
    // Captured during run() so the JSON response can report the reconcile-
    // specific counts; the guard/ledger only sees the projected IngestMetrics.
    let reconcileMetrics: ReconcileMetrics | null = null;
    const lifecycle = {
      promise: null as Promise<LifecycleApplyResult> | null,
      result: null as LifecycleApplyResult | null,
      failure: null as unknown,
    };
    let lifecycleSchemaUnavailable = false;
    const outcome = await runGuardedIngest({
      acquire: async () => {
        const result = await startReconcileRun(now);
        if (result.started) runId = result.runId;
        return result;
      },
      run: async () => {
        let inputs;
        try {
          inputs = await loadReconcileInputs({
            now,
            archiveConfirmedExpired: async () => {
              // The lifecycle RPC handles every due canonical row. Reusing one
              // lazy promise fans that transaction out to every expired result.
              lifecycle.promise ??= applyGiftCardLifecycle(now);
              try {
                lifecycle.result = await lifecycle.promise;
              } catch (error) {
                lifecycle.failure = error;
                lifecycleSchemaUnavailable ||=
                  isGiftCardLifecycleSchemaUnavailable(error);
                throw error;
              }
            },
          });
        } catch (error) {
          lifecycleSchemaUnavailable ||=
            isGiftCardLifecycleSchemaUnavailable(error);
          throw error;
        }
        const m = await runGiftCardReconcile({
          now: () => now,
          loadItems: async () => inputs.items,
          loadPredictionInputs: async () => inputs.predictionInputs,
          loadAcceptanceInputs: async () => inputs.acceptanceInputs,
          stageChanged: inputs.apply.stageChanged,
          refresh: inputs.apply.refresh,
          markSourceUnavailable: inputs.apply.markSourceUnavailable,
          handleExpired: inputs.apply.handleExpired,
          recordPredictionOutcome: inputs.apply.recordPredictionOutcome,
          recordAcceptanceOutcome: inputs.apply.recordAcceptanceOutcome,
        });
        if (lifecycleSchemaUnavailable && lifecycle.failure) {
          throw lifecycle.failure;
        }
        if (lifecycle.result) {
          for (const item of lifecycle.result.errors) {
            const message = `lifecycle ${item.offerId}/${item.step}: ${item.error}`;
            if (!m.errors.includes(message)) m.errors.push(message);
          }
          if (lifecycle.result.errors.length) m.status = "partial";
          if (
            lifecycle.result.activatedOfferIds.length > 0 ||
            lifecycle.result.archivedOfferIds.length > 0 ||
            lifecycle.result.historySealedOfferIds.length > 0
          ) {
            revalidateGiftCardLifecyclePaths(lifecycle.result.affectedStoreIds);
          }
        }
        reconcileMetrics = m;
        // Project into the shared ingest-ledger metrics shape.
        return {
          status: m.status,
          fetchStatus: "reconcile",
          itemsSeen: m.total,
          itemsNew: m.newOffers,
          itemsUpdated: m.changed,
          itemsUnchanged: m.refreshed,
          itemsRejected: m.parseFailures,
          candidatesNew: m.newOffers,
          candidatesChanged: m.changed,
          snapshotHash: null,
          errors: m.errors,
        };
      },
      finish: (id, metrics) => finishIngestRun(id, metrics, 1, new Date()),
      fail: (id, message) => failIngestRun(id, message, new Date()),
      report: (message) => lifecycleSchemaUnavailable
        ? Promise.resolve()
        : reportOperationalError("gift-card-reconcile", message),
    });

    if (!outcome.ran) {
      return Response.json({ ok: true, ran: false, skipped: outcome.skipped });
    }
    if ("failed" in outcome) {
      if (lifecycleSchemaUnavailable) {
        return Response.json(
          { ok: false, ran: false, skipped: "schema-unavailable" },
          { status: 503 },
        );
      }
      return Response.json({ ok: false, ran: true, error: "gift-card reconcile failed" }, { status: 500 });
    }
    const m: ReconcileMetrics =
      reconcileMetrics ?? {
        total: 0, changed: 0, refreshed: 0, newOffers: 0, withdrawn: 0,
        sourceUnavailable: 0, expired: 0, parseFailures: 0, acceptanceHints: 0,
        possibleDuplicates: 0, predictionsProcessed: 0, predictionsMatched: 0,
        acceptanceProcessed: 0, acceptanceChanged: 0, acceptanceStale: 0,
        errors: [], status: "ok",
      };
    return Response.json({
      ok: m.status !== "error",
      ran: true,
      runId,
      runKind: "reconcile",
      status: m.status,
      total: m.total,
      changedCandidates: m.changed,
      newOffers: m.newOffers,
      refreshed: m.refreshed,
      sourceUnavailable: m.sourceUnavailable,
      expired: m.expired,
      withdrawn: m.withdrawn,
      acceptanceHints: m.acceptanceHints,
      predictionsProcessed: m.predictionsProcessed,
      predictionsMatched: m.predictionsMatched,
      acceptance: {
        processed: m.acceptanceProcessed,
        changed: m.acceptanceChanged,
        stale: m.acceptanceStale,
      },
      errorCount: m.errors.length,
    });
  } catch (error) {
    if (isGiftCardJobRunSchemaUnavailable(error)) {
      return Response.json(
        { ok: false, ran: false, skipped: "schema-unavailable" },
        { status: 503 },
      );
    }
    await reportOperationalError("gift-card-reconcile", error);
    return Response.json({ ok: false, ran: false, error: "gift-card reconcile failed" }, { status: 500 });
  }
}
