import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Admin-side compliance reviews repository — SERVICE-ROLE ONLY.
 *
 * Records the human compliance review that gates the PLANNED OzBargain monitor.
 * Like the other admin repos it talks to Supabase through getSupabaseAdmin()
 * (which bypasses RLS) and must only run on the server behind requireAdmin();
 * the browser guard inside getSupabaseAdmin() is the backstop.
 *
 * This is record-keeping only. There is NO fetcher, cron, or agent here, and
 * nothing makes an external request. A review with approved_for_monitoring = true
 * is the gate the future monitor must check before it ever runs.
 */

/** A compliance review as the admin sees it. */
export interface AdminComplianceReview {
  id: string;
  sourceName: string;
  robotsTxtChecked: boolean;
  termsChecked: boolean;
  feedPathsAllowed: boolean;
  userAgentRecorded: boolean;
  rateLimitRecorded: boolean;
  approvedForMonitoring: boolean;
  reviewerEmail: string | null;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Validated, normalised values ready to be written to the DB. */
export interface ComplianceReviewInput {
  sourceName: string;
  robotsTxtChecked: boolean;
  termsChecked: boolean;
  feedPathsAllowed: boolean;
  userAgentRecorded: boolean;
  rateLimitRecorded: boolean;
  approvedForMonitoring: boolean;
  reviewerEmail: string | null;
  notes: string | null;
  reviewedAt: string | null;
}

interface ComplianceReviewRow {
  id: string;
  source_name: string;
  robots_txt_checked: boolean;
  terms_checked: boolean;
  feed_paths_allowed: boolean;
  user_agent_recorded: boolean;
  rate_limit_recorded: boolean;
  approved_for_monitoring: boolean;
  reviewer_email: string | null;
  notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapReview(r: ComplianceReviewRow): AdminComplianceReview {
  return {
    id: r.id,
    sourceName: r.source_name,
    robotsTxtChecked: r.robots_txt_checked,
    termsChecked: r.terms_checked,
    feedPathsAllowed: r.feed_paths_allowed,
    userAgentRecorded: r.user_agent_recorded,
    rateLimitRecorded: r.rate_limit_recorded,
    approvedForMonitoring: r.approved_for_monitoring,
    reviewerEmail: r.reviewer_email,
    notes: r.notes,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRow(input: ComplianceReviewInput) {
  return {
    source_name: input.sourceName,
    robots_txt_checked: input.robotsTxtChecked,
    terms_checked: input.termsChecked,
    feed_paths_allowed: input.feedPathsAllowed,
    user_agent_recorded: input.userAgentRecorded,
    rate_limit_recorded: input.rateLimitRecorded,
    approved_for_monitoring: input.approvedForMonitoring,
    reviewer_email: input.reviewerEmail,
    notes: input.notes,
    reviewed_at: input.reviewedAt,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every compliance review, newest first. */
export async function listComplianceReviews(): Promise<AdminComplianceReview[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("compliance_reviews")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listComplianceReviews failed: ${error.message}`);
  return ((data ?? []) as unknown as ComplianceReviewRow[]).map(mapReview);
}

/**
 * True when at least one review has approved_for_monitoring = true — the gate
 * every other surface checks. Cheap head-count read; never fetches anything.
 */
export async function isMonitoringApproved(): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from("compliance_reviews")
    .select("*", { count: "exact", head: true })
    .eq("approved_for_monitoring", true);
  if (error) throw new Error(`isMonitoringApproved failed: ${error.message}`);
  return (count ?? 0) > 0;
}

/** A single review by id, or null when it does not exist. */
export async function getComplianceReview(
  id: string
): Promise<AdminComplianceReview | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("compliance_reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getComplianceReview failed: ${error.message}`);
  if (!data) return null;
  return mapReview(data as unknown as ComplianceReviewRow);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts a new review and returns its generated id. */
export async function insertComplianceReview(
  input: ComplianceReviewInput
): Promise<string> {
  const db = getSupabaseAdmin();
  const id = randomUUID();
  const { error } = await db
    .from("compliance_reviews")
    .insert({ id, ...toRow(input) });
  if (error) throw new Error(`insertComplianceReview failed: ${error.message}`);
  return id;
}

/** Updates every editable field of an existing review. */
export async function updateComplianceReview(
  id: string,
  input: ComplianceReviewInput
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("compliance_reviews")
    .update(toRow(input))
    .eq("id", id);
  if (error) throw new Error(`updateComplianceReview failed: ${error.message}`);
}
