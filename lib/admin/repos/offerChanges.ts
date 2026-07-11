import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hasLastCheckedAt,
  isApplyPlan,
  isCardApplyPlan,
  planOfferApplication,
  OFFER_CHANGE_REVIEW_STATES,
  type OfferChangeCandidateInsert,
  type OfferChangeConfidence,
  type OfferChangeReviewState,
  type OfferSourceType,
} from "@/lib/monitor/offerChanges";
import type { FeedItemView } from "@/lib/monitor/detectOffers";
import type {
  DetectionPersistence,
  ResolvedTarget,
} from "@/lib/monitor/runDetection";

/**
 * Admin-side offer-change-candidates repository — SERVICE-ROLE ONLY.
 *
 * Backs the /admin/offer-changes review queue. Like the other admin repos it
 * talks to Supabase through getSupabaseAdmin() (which bypasses RLS) and must only
 * run on the server behind requireAdmin(); the browser guard inside
 * getSupabaseAdmin() is the backstop.
 *
 * Safety: staging writes (insertOfferChangeCandidates) only ever touch
 * offer_change_candidates and NEVER a published offer. The single place a
 * published offer changes is applyOfferChange(), which runs only from the admin
 * Apply action and only for a candidate still in review with a resolved target.
 * Ignoring / marking duplicate never touches public data. No scraping / fetching
 * / external calls live here — it talks only to our own Supabase project.
 */

/** Review states an admin can move a candidate INTO from the queue. */
export type OfferChangeManualState = Exclude<OfferChangeReviewState, "new" | "applied">;

/** A candidate as the admin review page sees it. */
export interface AdminOfferChange {
  id: string;
  sourceType: OfferSourceType;
  sourceName: string;
  merchantId: string | null;
  /** Joined store name for display; null when not merchant-specific. */
  storeName: string | null;
  targetId: string | null;
  detectedTitle: string;
  detectedRateOrDiscount: string;
  detectedUrl: string;
  previousValue: string | null;
  proposedValue: string;
  confidence: OfferChangeConfidence;
  rawSummary: string;
  contentHash: string;
  reviewState: OfferChangeReviewState;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** Structured prefill fields (e.g. a card offer's bonus points/annual fee). */
  payload: Record<string, unknown>;
}

interface OfferChangeRow {
  id: string;
  source_type: OfferSourceType;
  source_name: string;
  merchant_id: string | null;
  target_id: string | null;
  detected_title: string;
  detected_rate_or_discount: string;
  detected_url: string;
  previous_value: string | null;
  proposed_value: string;
  confidence: OfferChangeConfidence;
  raw_summary: string;
  content_hash: string;
  review_state: OfferChangeReviewState;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
  // Embedded one-to-one store (PostgREST returns an object, but type defensively).
  store: { name: string } | { name: string }[] | null;
}

function mapOfferChange(r: OfferChangeRow): AdminOfferChange {
  const store = Array.isArray(r.store) ? r.store[0] : r.store;
  return {
    id: r.id,
    sourceType: r.source_type,
    sourceName: r.source_name,
    merchantId: r.merchant_id,
    storeName: store?.name ?? null,
    targetId: r.target_id,
    detectedTitle: r.detected_title,
    detectedRateOrDiscount: r.detected_rate_or_discount,
    detectedUrl: r.detected_url,
    previousValue: r.previous_value,
    proposedValue: r.proposed_value,
    confidence: r.confidence,
    rawSummary: r.raw_summary,
    contentHash: r.content_hash,
    reviewState: r.review_state,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    payload: r.payload ?? {},
  };
}

const SELECT_WITH_STORE = "*, store:stores(name)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Candidates in a given triage state (defaults to the 'new' review queue). */
export async function listOfferChanges(
  reviewState: OfferChangeReviewState = "new"
): Promise<AdminOfferChange[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("offer_change_candidates")
    .select(SELECT_WITH_STORE)
    .eq("review_state", reviewState)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listOfferChanges failed: ${error.message}`);
  return ((data ?? []) as unknown as OfferChangeRow[]).map(mapOfferChange);
}

/** Count of candidates still awaiting review. */
export async function countNewOfferChanges(): Promise<number> {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from("offer_change_candidates")
    .select("id", { count: "exact", head: true })
    .eq("review_state", "new");
  if (error) throw new Error(`countNewOfferChanges failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Read-only ops snapshot for the /admin/monitor detection status card:
 * total candidate count, exact per-review-state counts, and when the most
 * recent candidate was staged (null when the table has never had a row — the
 * day-one prod state). Counts use head:true so no candidate content crosses the
 * wire — the card needs numbers, not raw feed titles.
 */
export interface DetectionOpsStatus {
  totalCandidates: number;
  /** Exact counts keyed by review_state (the canonical states from migration 004). */
  byReviewState: Record<OfferChangeReviewState, number>;
  /** ISO of the most recently staged candidate, or null if none ever. */
  latestStagedAt: string | null;
}

async function countOfferChangesWhere(
  db: ReturnType<typeof getSupabaseAdmin>,
  reviewState: OfferChangeReviewState
): Promise<number> {
  const { count, error } = await db
    .from("offer_change_candidates")
    .select("id", { count: "exact", head: true })
    .eq("review_state", reviewState);
  if (error) {
    throw new Error(
      `getDetectionOpsStatus count ${reviewState} failed: ${error.message}`
    );
  }
  return count ?? 0;
}

export async function getDetectionOpsStatus(): Promise<DetectionOpsStatus> {
  const db = getSupabaseAdmin();
  const [total, latest, ...stateCounts] = await Promise.all([
    (async () => {
      const { count, error } = await db
        .from("offer_change_candidates")
        .select("id", { count: "exact", head: true });
      if (error) {
        throw new Error(`getDetectionOpsStatus total count failed: ${error.message}`);
      }
      return count ?? 0;
    })(),
    (async () => {
      const { data, error } = await db
        .from("offer_change_candidates")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`getDetectionOpsStatus latest failed: ${error.message}`);
      }
      return (data as { created_at: string } | null)?.created_at ?? null;
    })(),
    ...OFFER_CHANGE_REVIEW_STATES.map((state) =>
      countOfferChangesWhere(db, state)
    ),
  ]);

  const byReviewState = Object.fromEntries(
    OFFER_CHANGE_REVIEW_STATES.map((state, i) => [state, stateCounts[i]])
  ) as Record<OfferChangeReviewState, number>;

  return { totalCandidates: total, byReviewState, latestStagedAt: latest };
}

/** A single candidate by id, or null when it does not exist. */
export async function getOfferChange(
  id: string
): Promise<AdminOfferChange | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("offer_change_candidates")
    .select(SELECT_WITH_STORE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getOfferChange failed: ${error.message}`);
  if (!data) return null;
  return mapOfferChange(data as unknown as OfferChangeRow);
}

// ── Staging write (monitor) ───────────────────────────────────────────────────

/**
 * Stage detected changes as `offer_change_candidates` (review_state 'new'),
 * ignoring conflicts on content_hash so re-runs are idempotent and never clobber
 * an admin's triage. Returns the number of NEW rows inserted. NEVER touches a
 * published offer — that only happens on admin Apply.
 */
export async function insertOfferChangeCandidates(
  rows: OfferChangeCandidateInsert[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("offer_change_candidates")
    .upsert(
      rows.map((r) => ({ ...r, review_state: "new" })),
      { onConflict: "content_hash", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    throw new Error(`insertOfferChangeCandidates failed: ${error.message}`);
  }
  return data?.length ?? 0;
}

// ── Detection persistence (SERVICE-ROLE; used by runDetection) ────────────────
// These back the runDetection orchestrator's DetectionPersistence contract. They
// READ our own staged feed_items and published offer rows, and WRITE only to
// offer_change_candidates via insertOfferChangeCandidates. No fetching, scraping,
// or external calls — everything runs against our own Supabase project, and
// nothing here ever mutates a published offer (that stays admin-Apply only).

interface FeedItemViewRow {
  raw_title: string;
  raw_summary: string;
  link: string;
  categories: string[] | null;
}

/**
 * Recently-staged feed items still in the 'new' review queue, newest first,
 * bounded by BOTH a time window (sinceIso) AND a row limit. Ignored items are
 * excluded (their category was already judged off-theme); applied/duplicate
 * states don't exist for feed_items. The bound stops the first enabled run from
 * scanning the whole backlog and flooding review.
 */
export async function listRecentNewFeedItems(
  sinceIso: string,
  limit: number
): Promise<FeedItemView[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_items")
    .select("raw_title, raw_summary, link, categories")
    .eq("review_state", "new")
    .gte("fetched_at", sinceIso)
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentNewFeedItems failed: ${error.message}`);
  return ((data ?? []) as unknown as FeedItemViewRow[]).map((r) => ({
    rawTitle: r.raw_title,
    rawSummary: r.raw_summary,
    link: r.link,
    categories: r.categories ?? [],
  }));
}

/**
 * content_hash + detected_url of ALL candidates, regardless of review_state.
 * Deduping against every row (not just 'new') keeps an ignored candidate from
 * resurrecting on later runs. It's a small table, so one unbounded select is fine.
 */
export async function listKnownCandidateKeys(): Promise<{
  hashes: string[];
  urls: string[];
}> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("offer_change_candidates")
    .select("content_hash, detected_url");
  if (error) throw new Error(`listKnownCandidateKeys failed: ${error.message}`);
  const rows = (data ?? []) as { content_hash: string; detected_url: string }[];
  return {
    hashes: rows.map((r) => r.content_hash).filter(Boolean),
    urls: rows.map((r) => r.detected_url).filter(Boolean),
  };
}

/**
 * Cashback offer for a merchant + provider. (merchant_id, provider) is unique in
 * practice (verified), so a single row resolves the target; anything else (none,
 * or an unexpected duplicate) returns null and the Apply flow refuses it safely.
 */
export async function resolveCashbackTarget(
  merchantId: string,
  provider: string
): Promise<ResolvedTarget | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("cashback_offers")
    .select("id, rate_percent")
    .eq("merchant_id", merchantId)
    .ilike("provider", provider)
    .limit(2);
  if (error) throw new Error(`resolveCashbackTarget failed: ${error.message}`);
  const rows = (data ?? []) as { id: string; rate_percent: number | null }[];
  if (rows.length !== 1) return null;
  return { id: rows[0].id, currentValue: `${Number(rows[0].rate_percent)}%` };
}

/** Whole-word, case-insensitive test — brand names must not match as substrings. */
function containsWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(haystack);
}

/**
 * Gift-card offer whose brand appears in the detected title. Gift cards key on
 * brand text (there is no merchant_id column), which does NOT reliably equal a
 * merchant name, so we match against gift_card_offers.brand and demand EXACTLY
 * one brand present in the title; zero or ambiguous → null.
 */
export async function resolveGiftCardTarget(
  detectedTitle: string
): Promise<ResolvedTarget | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_card_offers")
    .select("id, brand, discount_percent");
  if (error) throw new Error(`resolveGiftCardTarget failed: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    brand: string;
    discount_percent: number | null;
  }[];
  const hits = rows.filter((r) => r.brand && containsWord(detectedTitle, r.brand));
  if (hits.length !== 1) return null;
  return {
    id: hits[0].id,
    currentValue: `${Number(hits[0].discount_percent)}%`,
  };
}

/**
 * Points offer for a merchant. merchant_id is unique per points offer in practice
 * (verified); a single row resolves the target, anything else → null. Current
 * value prefers the human display string, falling back to the "Nx" multiple.
 */
export async function resolvePointsTarget(
  merchantId: string
): Promise<ResolvedTarget | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("points_offers")
    .select("id, earn_multiple, earn_rate_display")
    .eq("merchant_id", merchantId)
    .limit(2);
  if (error) throw new Error(`resolvePointsTarget failed: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    earn_multiple: number | null;
    earn_rate_display: string | null;
  }[];
  if (rows.length !== 1) return null;
  const row = rows[0];
  const currentValue =
    row.earn_rate_display && row.earn_rate_display.length > 0
      ? row.earn_rate_display
      : `${Number(row.earn_multiple)}x`;
  return { id: row.id, currentValue };
}

/**
 * Card offer whose provider narrows the search, then (when that issuer has
 * more than one card) whose card_name also appears in the detected title.
 * Unlike the other resolvers this takes the CANONICAL provider name (the
 * detector's own issuer allowlist already normalises "AmEx"/"Amex" etc. to
 * "American Express" — see lib/monitor/detectOffers.ts's CARD_ISSUERS), not
 * a substring match against free text, since card_offers.provider stores the
 * canonical name while OzBargain titles favour abbreviations.
 */
export async function resolveCardOfferTarget(
  provider: string,
  detectedTitle: string
): Promise<ResolvedTarget | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("card_offers")
    .select("id, card_name, bonus_points")
    .eq("is_archived", false)
    .ilike("provider", provider);
  if (error) throw new Error(`resolveCardOfferTarget failed: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    card_name: string;
    bonus_points: number | null;
  }[];
  if (rows.length === 0) return null;

  const named = rows.filter(
    (r) => r.card_name && containsWord(detectedTitle, r.card_name)
  );
  // Exactly one card under this issuer -> unambiguous even without a title
  // match (mirrors resolveCashbackTarget's "unique per merchant+provider in
  // practice"). Several cards under the same issuer -> the card_name match
  // must disambiguate; zero or multiple named hits stay unresolved.
  const hit = named.length === 1 ? named[0] : rows.length === 1 ? rows[0] : null;
  if (!hit) return null;
  return {
    id: hit.id,
    currentValue:
      hit.bonus_points != null ? `${hit.bonus_points}pts` : "no bonus on file",
  };
}

/**
 * Assemble the production DetectionPersistence for runDetection. Bundles the
 * reads/resolvers above with insertOfferChangeCandidates (which adds
 * review_state 'new' and is idempotent on content_hash). Colocated with the
 * other service-role code, exactly like runMonitor's persistence.
 */
export function createDetectionPersistence(): DetectionPersistence {
  return {
    listRecentNewFeedItems,
    listKnownCandidateKeys,
    resolveCashbackTarget,
    resolveGiftCardTarget,
    resolvePointsTarget,
    resolveCardOfferTarget,
    insertCandidates: insertOfferChangeCandidates,
  };
}

// ── Review actions ─────────────────────────────────────────────────────────────

export interface ApplyResult {
  table: string;
  targetId: string;
  changes: Record<string, number>;
  merchantId: string | null;
}

/**
 * Apply a candidate to its target offer — the ONLY path that mutates a published
 * offer. Reads the candidate, asks the pure planner what (if anything) to change,
 * and refuses unless it is still 'new' with a resolved, numeric target.
 *
 * Double-apply guard: the candidate is CLAIMED first with a conditional update
 * (review_state 'new' → 'applied'). Only the request that wins the claim touches
 * the offer; a concurrent Apply (second admin, second tab, double-click) updates
 * zero rows and gets a clear "already reviewed" error with nothing written. If
 * the offer update then fails, the claim is released (best-effort) so the
 * candidate can be retried. Called only from the admin Apply action (after
 * requireAdmin + an explicit confirm).
 */
export async function applyOfferChange(
  id: string,
  reviewerEmail: string | null
): Promise<ApplyResult> {
  const db = getSupabaseAdmin();
  const candidate = await getOfferChange(id);
  if (!candidate) throw new Error("Offer change candidate not found.");

  const plan = planOfferApplication({
    sourceType: candidate.sourceType,
    reviewState: candidate.reviewState,
    targetId: candidate.targetId,
    proposedValue: candidate.proposedValue,
    payload: candidate.payload,
  });
  if (!isApplyPlan(plan)) throw new Error(`Cannot apply: ${plan.skip}.`);

  // 1) Claim the candidate: only a row still in review can move to 'applied'.
  //    Zero rows updated = someone else reviewed it since we read it — stop
  //    before anything public is written.
  const { data: claimed, error: claimErr } = await db
    .from("offer_change_candidates")
    .update({
      review_state: "applied",
      reviewed_by: reviewerEmail,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("review_state", "new")
    .select("id");
  if (claimErr) {
    throw new Error(`applyOfferChange candidate claim failed: ${claimErr.message}`);
  }
  if (!claimed || claimed.length === 0) {
    throw new Error(
      "This candidate was already reviewed by someone else — nothing was applied."
    );
  }

  // 2) Update only planner-approved numeric fields. Publication and archive
  // state cannot be expressed in either plan shape.
  const changes = isCardApplyPlan(plan)
    ? plan.changes
    : { [plan.column]: plan.value };
  const offerUpdate: Record<string, unknown> = { ...changes };
  if (hasLastCheckedAt(plan.table)) {
    offerUpdate.last_checked_at = new Date().toISOString();
  }
  const { data: updated, error: offerErr } = await db
    .from(plan.table)
    // plan.table/plan.column span 4 different offer tables' Update shapes; the
    // typed client can't express "one dynamic column on one of these 4 tables"
    // as a static type, so this one write site is a deliberate escape hatch.
    .update(offerUpdate as never)
    .eq("id", plan.id)
    .select("id");
  if (offerErr || updated?.length !== 1) {
    // Release the claim (best-effort) so the candidate stays actionable.
    await db
      .from("offer_change_candidates")
      .update({ review_state: "new", reviewed_by: null, reviewed_at: null })
      .eq("id", id)
      .eq("review_state", "applied");
    throw new Error(
      `applyOfferChange offer update failed: ${offerErr?.message ?? "target not found"}`
    );
  }

  return {
    table: plan.table,
    targetId: plan.id,
    changes,
    merchantId: candidate.merchantId,
  };
}

/**
 * Dismiss a candidate as not relevant ('ignored') or already covered
 * ('duplicate'). Touches ONLY the staging row — never a published offer — so
 * reviewing an item away can never change public data.
 *
 * An 'applied' candidate can NOT be re-triaged: it is the audit record that a
 * public offer was changed, so flipping it to ignored/duplicate would make the
 * history lie. The conditional update below refuses that (zero rows → error).
 */
export async function setOfferChangeReviewState(
  id: string,
  state: OfferChangeManualState,
  reviewerEmail: string | null
): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("offer_change_candidates")
    .update({
      review_state: state,
      reviewed_by: reviewerEmail,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("review_state", "applied")
    .select("id");
  if (error) {
    throw new Error(`setOfferChangeReviewState failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      "Candidate not found, or already applied — applied changes cannot be re-triaged."
    );
  }
}
