import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { acquireGiftCardJobRun } from "./giftCardJobRuns";
import { isGiftCardJobRunSchemaUnavailable } from "./giftCardJobRunErrors";

/** Service-role persistence boundary for migration 032's lifecycle RPC. */

export const LIFECYCLE_RUN_SOURCE_ID = "gcdb";
export const LIFECYCLE_STALE_RUN_MINUTES = 6;
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "42883", "PGRST202"]);

export class GiftCardLifecycleSchemaUnavailableError extends Error {
  constructor(message = "Gift-card lifecycle schema is not available.") {
    super(message);
    this.name = "GiftCardLifecycleSchemaUnavailableError";
  }
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function throwRepoError(context: string, error: unknown): never {
  const value = error as { code?: string; message?: string } | null;
  const message = errorMessage(error);
  if (
    (value?.code && MISSING_SCHEMA_CODES.has(value.code)) ||
    /run_kind|lifecycle_state|apply_gift_card_offer_lifecycle|schema cache/i.test(message)
  ) {
    throw new GiftCardLifecycleSchemaUnavailableError(
      `${context}: required migrations 023/025/030/031/032 are not available.`,
    );
  }
  throw new Error(`${context}: ${message}`);
}

export function isGiftCardLifecycleSchemaUnavailable(
  error: unknown,
): error is GiftCardLifecycleSchemaUnavailableError {
  return error instanceof GiftCardLifecycleSchemaUnavailableError;
}

export type LifecycleRunStart =
  | { started: true; runId: string }
  | { started: false; reason: "already-running" };

/**
 * Claim migration 030's lifecycle slot. Only a stale lifecycle row for this
 * source is finalised. The DB mutation fence rejects acquisition while a
 * reconcile run is active.
 */
export async function startLifecycleRun(startedAt: Date): Promise<LifecycleRunStart> {
  let runId: string | null;
  try {
    runId = await acquireGiftCardJobRun({
      sourceId: LIFECYCLE_RUN_SOURCE_ID,
      runKind: "activate-archive",
      startedAt,
      staleAfterMinutes: LIFECYCLE_STALE_RUN_MINUTES,
    });
  } catch (error) {
    if (isGiftCardJobRunSchemaUnavailable(error)) {
      throw new GiftCardLifecycleSchemaUnavailableError(
        "startLifecycleRun: required migration 030 is not available.",
      );
    }
    throw error;
  }
  return runId
    ? { started: true, runId }
    : { started: false, reason: "already-running" };
}

/** Last fully successful local-day run. Error/partial runs remain retryable. */
export async function lastSuccessfulLifecycleRunStart(): Promise<Date | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("gift_card_ingest_runs")
    .select("started_at, status")
    .eq("source_id", LIFECYCLE_RUN_SOURCE_ID)
    .eq("run_kind" as never, "activate-archive" as never)
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwRepoError("lastSuccessfulLifecycleRunStart failed", error);
  return data ? new Date(data.started_at) : null;
}

export interface LifecycleApplyError {
  offerId: string;
  step: "activate" | "archive";
  error: string;
}

export interface LifecycleApplyResult {
  sydneyDate: string;
  activatedOfferIds: string[];
  archivedOfferIds: string[];
  historySealedOfferIds: string[];
  affectedStoreIds: string[];
  errors: LifecycleApplyError[];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapApplyResult(value: unknown): LifecycleApplyResult {
  if (!value || typeof value !== "object") {
    throw new Error("applyGiftCardLifecycle returned an invalid result.");
  }
  const row = value as Record<string, unknown>;
  if (typeof row.sydneyDate !== "string") {
    throw new Error("applyGiftCardLifecycle omitted the Sydney date.");
  }
  const errors = Array.isArray(row.errors)
    ? row.errors.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const error = item as Record<string, unknown>;
        if (
          typeof error.offerId !== "string" ||
          (error.step !== "activate" && error.step !== "archive") ||
          typeof error.error !== "string"
        ) {
          return [];
        }
        return [{
          offerId: error.offerId,
          step: error.step,
          error: error.error,
        } satisfies LifecycleApplyError];
      })
    : [];
  return {
    sydneyDate: row.sydneyDate,
    activatedOfferIds: strings(row.activatedOfferIds),
    archivedOfferIds: strings(row.archivedOfferIds),
    historySealedOfferIds: strings(row.historySealedOfferIds),
    affectedStoreIds: strings(row.affectedStoreIds),
    errors,
  };
}

/** Calls the single transactional, candidate-ineligible migration 032 RPC. */
export async function applyGiftCardLifecycle(now: Date): Promise<LifecycleApplyResult> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "apply_gift_card_offer_lifecycle" as never,
    { p_now: now.toISOString() } as never,
  );
  if (error) throwRepoError("applyGiftCardLifecycle failed", error);
  return mapApplyResult(data);
}

export async function finishLifecycleRun(
  runId: string,
  result: LifecycleApplyResult,
  finishedAt: Date,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("gift_card_ingest_runs")
    .update({
      completed_at: finishedAt.toISOString(),
      status: result.errors.length ? "partial" : "ok",
      fetch_status: "activate-archive",
      items_seen:
        result.activatedOfferIds.length + result.archivedOfferIds.length,
      items_new: result.activatedOfferIds.length,
      items_updated: result.archivedOfferIds.length,
      items_unchanged: 0,
      items_rejected: result.errors.length,
      parser_version: 1,
      error_summary: result.errors.length
        ? result.errors.map((item) => `${item.offerId}: ${item.error}`).join("; ").slice(0, 900)
        : null,
    })
    .eq("id", runId)
    .eq("status", "running");
  if (error) throwRepoError("finishLifecycleRun failed", error);
}

export async function failLifecycleRun(
  runId: string,
  message: string,
  finishedAt: Date,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("gift_card_ingest_runs")
    .update({
      completed_at: finishedAt.toISOString(),
      status: "error",
      error_summary: message.slice(0, 900),
    })
    .eq("id", runId)
    .eq("status", "running");
  if (error) throwRepoError("failLifecycleRun failed", error);
}
