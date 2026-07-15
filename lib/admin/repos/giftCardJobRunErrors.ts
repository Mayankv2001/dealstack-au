const MISSING_JOB_RUN_SCHEMA_CODES = new Set([
  "42703", // undefined_column (direct PostgreSQL)
  "42883", // undefined_function (direct PostgreSQL)
  "PGRST204", // PostgREST schema-cache column miss
  "PGRST202", // PostgREST schema-cache function miss
]);

export class GiftCardJobRunSchemaUnavailableError extends Error {
  constructor(message = "Gift-card job-run schema is not available.") {
    super(message);
    this.name = "GiftCardJobRunSchemaUnavailableError";
  }
}

export function isGiftCardJobRunSchemaUnavailable(
  error: unknown,
): error is GiftCardJobRunSchemaUnavailableError {
  return error instanceof GiftCardJobRunSchemaUnavailableError;
}

/** Convert an expected missing-migration failure into a controlled route state. */
export function throwGiftCardJobRunRepoError(
  context: string,
  error: unknown,
): never {
  const value = error as { code?: string; message?: string } | null;
  const message = value?.message ?? String(error);
  if (
    (value?.code && MISSING_JOB_RUN_SCHEMA_CODES.has(value.code)) ||
    /(?:\brun_kind\b|acquire_gift_card_job_run).*(?:does not exist|schema cache|could not find)/i.test(message)
  ) {
    throw new GiftCardJobRunSchemaUnavailableError(
      `${context}: migration 030 is not available.`,
    );
  }
  throw new Error(`${context}: ${message}`);
}
