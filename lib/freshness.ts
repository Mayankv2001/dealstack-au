import { formatDateAU } from "@/lib/sources/normalise";

/** Existing public UI window: a check remains recent for seven whole days. */
export const PUBLIC_FRESHNESS_DAYS = 7;

export type PublicFreshnessState =
  "checked-today" | "checked-this-week" | "needs-recheck" | "not-yet-checked";

export interface PublicFreshness {
  state: PublicFreshnessState;
  label:
    "Checked today" | "Checked this week" | "Needs recheck" | "Not yet checked";
  /** Supporting AU-formatted date. The state label never relies on this alone. */
  checkedDate: string | null;
}

const LABEL: Record<PublicFreshnessState, PublicFreshness["label"]> = {
  "checked-today": "Checked today",
  "checked-this-week": "Checked this week",
  "needs-recheck": "Needs recheck",
  "not-yet-checked": "Not yet checked",
};

/**
 * One public freshness interpretation shared by deals, store cards and store
 * detail. This is presentation/eligibility logic only; it does not alter the
 * stack engine's separate stale-data warning boundary.
 */
export function publicFreshness(
  checkedAt: string | null | undefined,
  now: Date,
): PublicFreshness {
  if (!checkedAt) {
    return {
      state: "not-yet-checked",
      label: LABEL["not-yet-checked"],
      checkedDate: null,
    };
  }

  const checked = Date.parse(checkedAt);
  if (Number.isNaN(checked)) {
    return {
      state: "needs-recheck",
      label: LABEL["needs-recheck"],
      checkedDate: null,
    };
  }

  const ageDays = Math.floor((now.getTime() - checked) / 86_400_000);
  const state: PublicFreshnessState =
    ageDays <= 0
      ? "checked-today"
      : ageDays <= PUBLIC_FRESHNESS_DAYS
        ? "checked-this-week"
        : "needs-recheck";

  return {
    state,
    label: LABEL[state],
    checkedDate: formatDateAU(checkedAt.slice(0, 10)),
  };
}

export function isPubliclyFresh(
  checkedAt: string | null | undefined,
  now: Date,
): boolean {
  const state = publicFreshness(checkedAt, now).state;
  return state === "checked-today" || state === "checked-this-week";
}
