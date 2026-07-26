import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Citation, Confidence } from "@/lib/sources/types";
import type { PointsTransferBonus } from "@/lib/offers/types";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";

/**
 * Points transfer bonuses — SERVICE-ROLE ONLY.
 *
 * The admin twin of the public getTransferBonuses(). Like every other admin
 * repo this must only run on the server behind requireAdmin(); the browser
 * guard inside getSupabaseAdmin() is the backstop.
 *
 * Writes are draft-first: insert never sets is_published, so a new bonus is
 * invisible publicly until someone explicitly publishes it. That is the same
 * publication boundary the rest of the offer model uses.
 */

/** Programme slugs a bonus may reference, for the form dropdowns. */
export const PROGRAMME_OPTIONS = REWARDS_PROGRAMMES.map((programme) => ({
  value: programme.slug,
  label: programme.name,
}));

export const CONFIDENCE_LEVELS: Confidence[] = [
  "confirmed",
  "needs-verification",
  "expired-unknown",
];

export interface AdminTransferBonus extends PointsTransferBonus {
  isPublished: boolean;
  updatedAt: string;
}

export interface TransferBonusInput {
  fromProgramme: string;
  toProgramme: string;
  bonusPercentMin: number;
  bonusPercentMax: number;
  startsOn: string | null;
  expiryDate: string | null;
  conditionsNote: string | null;
  citations: Citation[];
  confidence: Confidence;
}

interface AdminTransferBonusRow {
  id: string;
  from_programme: string;
  to_programme: string;
  bonus_percent_min: number | string;
  bonus_percent_max: number | string;
  starts_on: string | null;
  expiry_date: string | null;
  conditions_note: string | null;
  citations: Citation[];
  confidence: Confidence;
  last_checked_at: string;
  is_published: boolean;
  updated_at: string;
}

const num = (value: number | string): number =>
  typeof value === "number" ? value : Number(value);

function mapAdmin(r: AdminTransferBonusRow): AdminTransferBonus {
  return {
    id: r.id,
    fromProgramme: r.from_programme,
    toProgramme: r.to_programme,
    bonusPercentMin: num(r.bonus_percent_min),
    bonusPercentMax: num(r.bonus_percent_max),
    startsOn: r.starts_on,
    expiryDate: r.expiry_date,
    conditionsNote: r.conditions_note,
    citations: Array.isArray(r.citations) ? r.citations : [],
    confidence: r.confidence,
    lastCheckedAt: r.last_checked_at,
    isPublished: r.is_published,
    updatedAt: r.updated_at,
  };
}

function toRow(input: TransferBonusInput) {
  return {
    from_programme: input.fromProgramme,
    to_programme: input.toProgramme,
    bonus_percent_min: input.bonusPercentMin,
    bonus_percent_max: input.bonusPercentMax,
    starts_on: input.startsOn,
    expiry_date: input.expiryDate,
    conditions_note: input.conditionsNote,
    citations: input.citations,
    confidence: input.confidence,
    last_checked_at: new Date().toISOString(),
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listTransferBonuses(): Promise<AdminTransferBonus[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("points_transfer_bonuses")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listTransferBonuses failed: ${error.message}`);
  return ((data ?? []) as unknown as AdminTransferBonusRow[]).map(mapAdmin);
}

export async function getTransferBonus(
  id: string
): Promise<AdminTransferBonus | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("points_transfer_bonuses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getTransferBonus failed: ${error.message}`);
  if (!data) return null;
  return mapAdmin(data as unknown as AdminTransferBonusRow);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts a DRAFT bonus (never published on create) and returns its id. */
export async function insertTransferBonus(
  input: TransferBonusInput
): Promise<string> {
  const db = getSupabaseAdmin();
  const id = `xfer-${input.fromProgramme}-${randomUUID().slice(0, 8)}`;
  const { error } = await db
    .from("points_transfer_bonuses")
    .insert({ id, ...toRow(input) } as never);
  if (error) throw new Error(`insertTransferBonus failed: ${error.message}`);
  return id;
}

export async function updateTransferBonus(
  id: string,
  input: TransferBonusInput
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("points_transfer_bonuses")
    .update(toRow(input) as never)
    .eq("id", id);
  if (error) throw new Error(`updateTransferBonus failed: ${error.message}`);
}

export async function setTransferBonusPublished(
  id: string,
  isPublished: boolean
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("points_transfer_bonuses")
    .update({ is_published: isPublished } as never)
    .eq("id", id);
  if (error) {
    throw new Error(`setTransferBonusPublished failed: ${error.message}`);
  }
}
