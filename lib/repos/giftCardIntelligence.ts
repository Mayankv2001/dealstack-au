import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { reportOperationalError } from "@/lib/observability/report-server-error";
import { getSupabaseServer, isStaticDataSource, toNumberOrNull, type DbClient } from "@/lib/supabase/server";

export interface GiftCardProgrammeRate {
  id: string;
  programmeId: string;
  brandName: string;
  promotionType: string;
  discountPercent: number | null;
  fixedDiscountDollars: number | null;
  bonusPercent: number | null;
  feeWaiverDollars: number | null;
  thresholdDollars: number | null;
  membershipTier: string | null;
  paymentRequirement: string | null;
  sourceUrl: string;
  lastCheckedAt: string;
  reviewByDate: string;
}

export interface GiftCardProgramme {
  id: string;
  provider: string;
  name: string;
  programmeKind: string;
  membershipRequired: boolean;
  accountRequired: boolean;
  accountRequirement: string | null;
  paymentRequirement: string | null;
  sourceUrl: string;
  termsUrl: string | null;
  lastCheckedAt: string;
  reviewByDate: string;
  rates: GiftCardProgrammeRate[];
}

export interface PublicGiftCardOccurrence {
  id: string;
  sourceOfferId: string | null;
  sellerKey: string;
  sellerName: string;
  productKey: string;
  productName: string;
  promotionType: string;
  discountPercent: number | null;
  fixedDollars: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  fixedPoints: number | null;
  pointsProgramme: string | null;
  thresholdDollars: number | null;
  startDate: string | null;
  endDate: string;
  sourceUrl: string;
  verifiedAt: string;
}

interface ProgrammeRow {
  id: string;
  provider: string;
  name: string;
  programme_kind: string;
  membership_required: boolean;
  account_required: boolean;
  account_requirement: string | null;
  payment_requirement: string | null;
  source_url: string;
  terms_url: string | null;
  last_checked_at: string;
  review_by_date: string;
}

interface RateRow {
  id: string;
  programme_id: string;
  brand_name: string;
  promotion_type: string;
  discount_percent: number | string | null;
  fixed_discount_dollars: number | string | null;
  bonus_percent: number | string | null;
  fee_waiver_dollars: number | string | null;
  threshold_dollars: number | string | null;
  membership_tier: string | null;
  payment_requirement: string | null;
  source_url: string;
  last_checked_at: string;
  review_by_date: string;
}

interface OccurrenceRow {
  id: string;
  source_offer_id: string | null;
  seller_key: string;
  seller_name: string;
  product_key: string;
  product_name: string;
  promotion_type: string;
  discount_percent: number | string | null;
  fixed_dollars: number | string | null;
  bonus_percent: number | string | null;
  points_multiplier: number | string | null;
  fixed_points: number | string | null;
  points_programme: string | null;
  threshold_dollars: number | string | null;
  start_date: string | null;
  end_date: string;
  source_url: string;
  verified_at: string;
}

function proposedTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string };
  return value.code === "42P01" || value.code === "PGRST205" || value.message?.includes("Could not find the table") === true;
}

async function fromProposedTable<T>(label: string, query: (db: DbClient) => Promise<T[]>): Promise<T[]> {
  if (isStaticDataSource()) return [];
  const db = getSupabaseServer();
  if (!db) return [];
  try {
    return await query(db);
  } catch (error) {
    // Migrations 024–026 are approval-gated. Their absence is an expected
    // rollout state, not an operational incident. All other errors still page.
    if (proposedTableMissing(error)) return [];
    await reportOperationalError(`public-repo-${label}`, error);
    return [];
  }
}

/**
 * Migration 024 is deliberately unapplied, so generated database types do not
 * contain these tables yet. The table-name casts are narrow and temporary;
 * runtime still uses the literal names and anon RLS. Regenerate types after
 * approval, then remove the casts.
 */
export async function getGiftCardProgrammes(): Promise<GiftCardProgramme[]> {
  const [programmes, rates] = await Promise.all([
    fromProposedTable("gift_card_programmes", async (db) => {
      const { data, error } = await db
        .from("gift_card_programmes" as "stores")
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as ProgrammeRow[];
    }),
    fromProposedTable("gift_card_programme_rates", async (db) => {
      const { data, error } = await db
        .from("gift_card_programme_rates" as "stores")
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as RateRow[];
    }),
  ]);
  return programmes.flatMap((row) => {
    const sourceUrl = safeHttpsUrl(row.source_url);
    if (!sourceUrl) return [];
    const programmeRates = rates.flatMap((rate) => {
      if (rate.programme_id !== row.id) return [];
      const rateSource = safeHttpsUrl(rate.source_url);
      if (!rateSource) return [];
      return [{
        id: rate.id,
        programmeId: rate.programme_id,
        brandName: rate.brand_name,
        promotionType: rate.promotion_type,
        discountPercent: toNumberOrNull(rate.discount_percent),
        fixedDiscountDollars: toNumberOrNull(rate.fixed_discount_dollars),
        bonusPercent: toNumberOrNull(rate.bonus_percent),
        feeWaiverDollars: toNumberOrNull(rate.fee_waiver_dollars),
        thresholdDollars: toNumberOrNull(rate.threshold_dollars),
        membershipTier: rate.membership_tier,
        paymentRequirement: rate.payment_requirement,
        sourceUrl: rateSource,
        lastCheckedAt: rate.last_checked_at,
        reviewByDate: rate.review_by_date,
      }];
    });
    return [{
      id: row.id,
      provider: row.provider,
      name: row.name,
      programmeKind: row.programme_kind,
      membershipRequired: row.membership_required,
      accountRequired: row.account_required,
      accountRequirement: row.account_requirement,
      paymentRequirement: row.payment_requirement,
      sourceUrl,
      termsUrl: row.terms_url ? safeHttpsUrl(row.terms_url) : null,
      lastCheckedAt: row.last_checked_at,
      reviewByDate: row.review_by_date,
      rates: programmeRates,
    }];
  });
}

/** Public sealed occurrences only; RLS supplies the publication boundary. */
export async function getGiftCardOfferOccurrences(): Promise<PublicGiftCardOccurrence[]> {
  const rows = await fromProposedTable(
    "gift_card_offer_occurrences",
    async (db) => {
      const { data, error } = await db
        .from("gift_card_offer_occurrences" as "stores")
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as OccurrenceRow[];
    }
  );
  return rows.flatMap((row) => {
    const sourceUrl = safeHttpsUrl(row.source_url);
    if (!sourceUrl) return [];
    return [{
      id: row.id,
      sourceOfferId: row.source_offer_id,
      sellerKey: row.seller_key,
      sellerName: row.seller_name,
      productKey: row.product_key,
      productName: row.product_name,
      promotionType: row.promotion_type,
      discountPercent: toNumberOrNull(row.discount_percent),
      fixedDollars: toNumberOrNull(row.fixed_dollars),
      bonusPercent: toNumberOrNull(row.bonus_percent),
      pointsMultiplier: toNumberOrNull(row.points_multiplier),
      fixedPoints: toNumberOrNull(row.fixed_points),
      pointsProgramme: row.points_programme,
      thresholdDollars: toNumberOrNull(row.threshold_dollars),
      startDate: row.start_date,
      endDate: row.end_date,
      sourceUrl,
      verifiedAt: row.verified_at,
    }];
  }).sort((a, b) => b.endDate.localeCompare(a.endDate));
}
