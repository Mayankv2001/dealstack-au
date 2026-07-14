import type { PublicDealKind } from "./types";

/**
 * URL state for /deals — the single source of truth for search, view, filter,
 * sort and page state. Parsing is tolerant (bad values fall back to defaults)
 * and understands the legacy Weekly-Deals params so old shared links keep
 * working: `view=signals|best-stacks|expiring-soon|all`, the four programme
 * chip ids, `store=` and `confidence=`.
 */

export const DEALS_VIEWS = [
  "discover",
  "top",
  "recent",
  "popular",
  "stacks",
  "gift-cards",
  "cashback",
  "points",
  "community",
  "expiring",
] as const;
export type DealsView = (typeof DEALS_VIEWS)[number];

export const VIEW_LABEL: Record<DealsView, string> = {
  discover: "All deals",
  top: "Best verified",
  recent: "Latest",
  popular: "Popular",
  stacks: "Best stacks",
  "gift-cards": "Gift cards",
  cashback: "Cashback",
  points: "Points",
  community: "Community",
  expiring: "Expiring",
};

/** Views that narrow to one deal kind. */
export const VIEW_KIND: Partial<Record<DealsView, PublicDealKind>> = {
  "gift-cards": "gift-card",
  cashback: "cashback",
  points: "points",
  community: "community",
};

export const DEAL_KIND_FILTERS = [
  "gift-card",
  "cashback",
  "points",
  "community",
] as const satisfies readonly PublicDealKind[];

export const DEAL_KIND_LABEL: Record<
  (typeof DEAL_KIND_FILTERS)[number],
  string
> = {
  "gift-card": "Gift cards",
  cashback: "Cashback",
  points: "Points",
  community: "Community",
};

export const DEALS_SORTS = [
  "recommended",
  "newest",
  "discussed",
  "expiring",
  "saving",
  "price-low",
  "checked",
] as const;
export type DealsSort = (typeof DEALS_SORTS)[number];

export const SORT_LABEL: Record<DealsSort, string> = {
  recommended: "Recommended",
  newest: "Newly added",
  discussed: "Most discussed",
  expiring: "Expiring soon",
  saving: "Biggest saving",
  "price-low": "Lowest price",
  checked: "Recently checked",
};

export const PROGRAMS = [
  "qantas",
  "velocity",
  "everyday-rewards",
  "flybuys",
] as const;
export type Program = (typeof PROGRAMS)[number];

export const PROGRAM_LABEL: Record<Program, string> = {
  qantas: "Qantas",
  velocity: "Velocity",
  "everyday-rewards": "Everyday Rewards",
  flybuys: "Flybuys",
};

/** Search terms a programme filter matches against a deal's search text. */
export const PROGRAM_MATCH: Record<Program, string> = {
  qantas: "qantas",
  velocity: "velocity",
  "everyday-rewards": "everyday",
  flybuys: "flybuys",
};

export const TRUST_FILTERS = [
  "verified",
  "source-checked",
  "community",
] as const;
export type TrustFilter = (typeof TRUST_FILTERS)[number];

export const TRUST_FILTER_LABEL: Record<TrustFilter, string> = {
  verified: "Verified by DealStack",
  "source-checked": "Source checked",
  community: "Community reported",
};

export type AddedFilter = "today" | "week" | null;
export type ChannelFilter = "online" | "in-store" | null;
export type EndingFilter = "72h" | "week" | null;

export interface DealsParams {
  q: string;
  view: DealsView;
  sort: DealsSort;
  merchant: string | null;
  program: Program | null;
  trust: TrustFilter | null;
  kind: (typeof DEAL_KIND_FILTERS)[number] | null;
  coupon: boolean;
  stackable: boolean;
  membership: boolean;
  activation: boolean;
  targeted: boolean;
  added: AddedFilter;
  channel: ChannelFilter;
  ending: EndingFilter;
  minSaving: number | null;
  page: number;
  /** Spend (dollars) the stack estimates are calculated on. */
  spend: number;
}

export const DEFAULT_PARAMS: DealsParams = {
  q: "",
  view: "discover",
  sort: "recommended",
  merchant: null,
  program: null,
  trust: null,
  kind: null,
  coupon: false,
  stackable: false,
  membership: false,
  activation: false,
  targeted: false,
  added: null,
  channel: null,
  ending: null,
  minSaving: null,
  page: 1,
  spend: 500,
};

/** Preset spend options for the stacks spend selector. */
export const SPEND_PRESETS = [100, 250, 500] as const;
export const MIN_SPEND = 50;
export const MAX_SPEND = 20_000;

export const PAGE_SIZE = 24;

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

const LEGACY_VIEW: Record<string, DealsView> = {
  all: "top",
  "best-stacks": "stacks",
  signals: "community",
  "expiring-soon": "expiring",
};

export function parseDealsParams(raw: RawSearchParams): DealsParams {
  const params: DealsParams = { ...DEFAULT_PARAMS };

  params.q = first(raw.q).slice(0, 80);

  const rawView = first(raw.view);
  if ((DEALS_VIEWS as readonly string[]).includes(rawView)) {
    const view = rawView as DealsView;
    const legacyKind = VIEW_KIND[view];
    params.view = legacyKind ? "discover" : view;
    params.kind = (legacyKind as DealsParams["kind"]) ?? null;
  } else if (rawView in LEGACY_VIEW) {
    const view = LEGACY_VIEW[rawView];
    const legacyKind = VIEW_KIND[view];
    params.view = legacyKind ? "discover" : view;
    params.kind = (legacyKind as DealsParams["kind"]) ?? null;
  } else if ((PROGRAMS as readonly string[]).includes(rawView)) {
    // Legacy programme chips were views; they are a filter now.
    params.view = "top";
    params.program = rawView as Program;
  }

  const rawSort = first(raw.sort);
  if ((DEALS_SORTS as readonly string[]).includes(rawSort)) {
    params.sort = rawSort as DealsSort;
  }

  params.merchant = first(raw.merchant) || first(raw.store) || null;

  const rawProgram = first(raw.program);
  if ((PROGRAMS as readonly string[]).includes(rawProgram)) {
    params.program = rawProgram as Program;
  }

  const rawTrust = first(raw.trust);
  if ((TRUST_FILTERS as readonly string[]).includes(rawTrust)) {
    params.trust = rawTrust as TrustFilter;
  } else if (first(raw.confidence) === "confirmed") {
    params.trust = "verified"; // legacy confidence filter
  }

  const rawKind = first(raw.kind);
  if ((DEAL_KIND_FILTERS as readonly string[]).includes(rawKind)) {
    params.kind = rawKind as DealsParams["kind"];
  }

  params.coupon = first(raw.coupon) === "1";
  params.stackable = first(raw.stackable) === "1";
  params.membership = first(raw.membership) === "1";
  params.activation = first(raw.activation) === "1";
  params.targeted = first(raw.targeted) === "1";

  const rawAdded = first(raw.added);
  if (rawAdded === "today" || rawAdded === "week") params.added = rawAdded;

  const rawChannel = first(raw.channel);
  if (rawChannel === "online" || rawChannel === "in-store") {
    params.channel = rawChannel;
  }

  const rawEnding = first(raw.ending);
  if (rawEnding === "72h" || rawEnding === "week") {
    params.ending = rawEnding;
  }

  const minSaving = Number.parseInt(first(raw.minSaving), 10);
  if ([5, 10, 20].includes(minSaving)) params.minSaving = minSaving;

  const page = Number.parseInt(first(raw.page), 10);
  if (Number.isFinite(page) && page >= 1 && page <= 500) params.page = page;

  const spend = Number.parseInt(first(raw.spend), 10);
  if (Number.isFinite(spend)) {
    params.spend = Math.min(MAX_SPEND, Math.max(MIN_SPEND, spend));
  }

  return params;
}

/**
 * True when the request is the untouched default page — the curated Discover
 * layout. Any query, filter, sort or explicit view switches to results mode.
 */
export function isDiscoverMode(params: DealsParams): boolean {
  return (
    params.view === "discover" &&
    params.q === "" &&
    params.merchant == null &&
    params.program == null &&
    params.trust == null &&
    params.kind == null &&
    !params.coupon &&
    !params.stackable &&
    !params.membership &&
    !params.activation &&
    !params.targeted &&
    params.added == null &&
    params.channel == null &&
    params.ending == null &&
    params.minSaving == null
  );
}

/** Count of active narrowing filters (excludes view/sort/page/search). */
export function activeFilterCount(params: DealsParams): number {
  let count = 0;
  if (params.merchant) count++;
  if (params.program) count++;
  if (params.trust) count++;
  if (params.kind) count++;
  if (params.coupon) count++;
  if (params.stackable) count++;
  if (params.membership) count++;
  if (params.activation) count++;
  if (params.targeted) count++;
  if (params.added) count++;
  if (params.channel) count++;
  if (params.ending) count++;
  if (params.minSaving != null) count++;
  return count;
}

/**
 * Serialise params (with overrides) into a /deals href. Defaults are omitted
 * so URLs stay clean and shareable; changing anything except `page` resets
 * pagination.
 */
export function dealsHref(
  params: DealsParams,
  overrides: Partial<DealsParams> = {},
): string {
  const merged = { ...params, ...overrides };
  if (!("page" in overrides)) merged.page = 1;
  const query = new URLSearchParams();
  if (merged.q) query.set("q", merged.q);
  if (merged.view !== "discover") query.set("view", merged.view);
  if (merged.sort !== "recommended") query.set("sort", merged.sort);
  if (merged.merchant) query.set("merchant", merged.merchant);
  if (merged.program) query.set("program", merged.program);
  if (merged.trust) query.set("trust", merged.trust);
  if (merged.kind) query.set("kind", merged.kind);
  if (merged.coupon) query.set("coupon", "1");
  if (merged.stackable) query.set("stackable", "1");
  if (merged.membership) query.set("membership", "1");
  if (merged.activation) query.set("activation", "1");
  if (merged.targeted) query.set("targeted", "1");
  if (merged.added) query.set("added", merged.added);
  if (merged.channel) query.set("channel", merged.channel);
  if (merged.ending) query.set("ending", merged.ending);
  if (merged.minSaving != null)
    query.set("minSaving", String(merged.minSaving));
  if (merged.spend !== DEFAULT_PARAMS.spend)
    query.set("spend", String(merged.spend));
  if (merged.page > 1) query.set("page", String(merged.page));
  const qs = query.toString();
  return qs ? `/deals?${qs}` : "/deals";
}
