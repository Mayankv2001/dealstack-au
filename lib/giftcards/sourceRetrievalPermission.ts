export interface SourceRetrievalPermission {
  sourceExists: boolean;
  enabled: boolean;
  automatedFetchAllowed: boolean;
  termsCheckedAt: string | null;
  robotsCheckedAt: string | null;
}

export type AutomatedRetrievalDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "environment-disabled"
        | "source-missing"
        | "source-disabled"
        | "fetch-not-permitted"
        | "permission-review-incomplete";
    };

/**
 * Decide whether an automated source retrieval is permitted. This pure gate is
 * intentionally independent of scheduling and `force`: every permission fact
 * must be present before a route may acquire a run lock or perform network IO.
 */
export function decideAutomatedRetrieval(
  environmentEnabled: boolean,
  permission: SourceRetrievalPermission,
): AutomatedRetrievalDecision {
  if (!environmentEnabled)
    return { allowed: false, reason: "environment-disabled" };
  if (!permission.sourceExists)
    return { allowed: false, reason: "source-missing" };
  if (!permission.enabled)
    return { allowed: false, reason: "source-disabled" };
  if (!permission.automatedFetchAllowed)
    return { allowed: false, reason: "fetch-not-permitted" };
  if (!permission.termsCheckedAt || !permission.robotsCheckedAt) {
    return { allowed: false, reason: "permission-review-incomplete" };
  }
  return { allowed: true };
}
