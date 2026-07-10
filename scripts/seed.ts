/**
 * Seed Supabase from the current static data.
 *
 * Reads the existing arrays in lib/data.ts and lib/offers/manualOffers.ts and
 * writes them into the Supabase tables created by
 * supabase/migrations/001_initial_schema.sql.
 *
 * MODES
 *   default        INSERT-ONLY: adds rows whose id does not exist yet and
 *                  leaves every existing row completely untouched. Safe to
 *                  re-run — it can never clobber values or publish states an
 *                  admin has edited in the panel.
 *   --overwrite    UPSERT: rows with a matching id are RESET to the static
 *                  values, including is_published. Any admin edits and any
 *                  unpublish done by cleanup-old-deals on those rows ARE LOST.
 *                  Only use this to deliberately restore the static baseline.
 *
 * NO network calls to OzBargain/ShopBack/TopCashback/GCDB/FreePoints — this only
 * talks to your own Supabase project using the service-role key.
 *
 * Required environment variables (put them in .env.local, see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL      - your project URL
 *   SUPABASE_SERVICE_ROLE_KEY     - service role key (server/script ONLY)
 *
 * Run:
 *   1. Apply supabase/migrations/001_initial_schema.sql to your project first.
 *   2. npm run seed                    # insert-only (existing rows untouched)
 *      npm run seed -- --overwrite     # reset seeded rows to static values
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { stores } from "../lib/data";
import {
  cardOffers,
  cashbackOffers,
  giftCardOffers,
  ozBargainSignals,
  pointsOffers,
  weeklyDeals,
} from "../lib/offers/manualOffers";
import { supabaseServiceRoleKey, supabaseUrl } from "../lib/env";
import { filterSeedableSignals, type SignalSeedRow } from "./seed-filters";

// Load .env.local for standalone runs (Next loads it for the app, scripts don't).
type WithLoadEnv = { loadEnvFile?: (path?: string) => void };
try {
  (process as unknown as WithLoadEnv).loadEnvFile?.(".env.local");
} catch {
  // .env.local not found — fall back to shell-provided environment variables.
}

// ── CLI args ─────────────────────────────────────────────────────────────────
// Insert-only is the DEFAULT; overwriting live rows requires the explicit flag.
const OVERWRITE = process.argv.slice(2).includes("--overwrite");

type Row = Record<string, unknown>;

// Permissive schema so dynamic table names accept Row[] (we don't generate
// typed Supabase types in this phase). Keeps the client fully typed otherwise.
type LooseDB = {
  public: {
    Tables: Record<
      string,
      { Row: Row; Insert: Row; Update: Row; Relationships: [] }
    >;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type DbClient = SupabaseClient<LooseDB>;

async function seedTable(
  supabase: DbClient,
  table: string,
  rows: Row[]
): Promise<void> {
  if (rows.length === 0) {
    console.log(`• ${table}: nothing to seed`);
    return;
  }
  // Default: ignoreDuplicates leaves existing rows untouched (insert-only).
  // --overwrite: matching ids are reset to the static values.
  const { data, error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: "id", ignoreDuplicates: !OVERWRITE })
    .select("id");
  if (error) {
    throw new Error(`Failed seeding ${table}: ${error.message}`);
  }
  const touched = data?.length ?? 0;
  if (OVERWRITE) {
    console.log(`✓ ${table}: upserted ${touched} (existing rows OVERWRITTEN)`);
  } else {
    console.log(
      `✓ ${table}: inserted ${touched} new of ${rows.length} (existing rows untouched)`
    );
  }
}

// ── Row mappers (camelCase → snake_case; undefined → null) ───────────────────

const storeRows: Row[] = stores.map((s, i) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  logo: s.logo,
  logo_path: s.logoPath ?? null,
  logo_text: s.logoText ?? null,
  logo_subtext: s.logoSubtext ?? null,
  logo_theme: s.logoTheme ?? null,
  discount_percent: s.discountPercent,
  discount_code: s.discountCode,
  expiry_date: s.expiryDate,
  cashback_percent: s.cashbackPercent,
  cashback_provider: s.cashbackProvider,
  gift_card_discount_percent: s.giftCardDiscountPercent,
  gift_card_source: s.giftCardSource,
  points_program: s.pointsProgram,
  points_rate: s.pointsRate,
  is_published: true,
  sort_order: i,
  // `aliases` intentionally left to its '{}' default — merchant aliases still
  // live in lib/sources/normalise.ts for this phase.
}));

const giftCardRows: Row[] = giftCardOffers.map((o) => ({
  id: o.id,
  brand: o.brand,
  discount_percent: o.discountPercent,
  channel: o.channel,
  source: o.source,
  accepted_at_merchant_ids: o.acceptedAtMerchantIds,
  points_on_purchase: o.pointsOnPurchase ?? null,
  cap_dollars: o.capDollars ?? null,
  expiry_date: o.expiryDate ?? null,
  start_date: o.startDate ?? null,
  purchase_location: o.purchaseLocation ?? null,
  purchase_method: o.purchaseMethod ?? null,
  limit_per_customer: o.limitPerCustomer ?? null,
  accepted_at: o.acceptedAt ?? [],
  usage_notes: o.usageNotes ?? [],
  stack_notes: o.stackNotes ?? [],
  source_detail_url: o.sourceDetailUrl ?? null,
  citations: o.citations,
  confidence: o.confidence,
  last_checked_at: o.lastCheckedAt,
  is_published: true,
}));

// card_offers requires migration 007 to be applied first — see
// supabase/migrations/007_card_offers.sql. Rows go in UNPUBLISHED (unlike the
// other offer tables above): an admin must review and publish each one by
// hand at /admin/card-offers before it can appear anywhere public.
const cardOfferRows: Row[] = cardOffers.map((o) => ({
  id: o.id,
  provider: o.provider,
  card_name: o.cardName,
  offer_type: o.offerType,
  bonus_points: o.bonusPoints,
  cashback_amount: o.cashbackAmount,
  statement_credit_amount: o.statementCreditAmount,
  minimum_spend: o.minimumSpend,
  minimum_spend_period: o.minimumSpendPeriod,
  annual_fee: o.annualFee,
  eligibility_notes: o.eligibilityNotes,
  offer_summary: o.offerSummary,
  source_url: o.sourceUrl,
  confidence: o.confidence,
  expiry_date: o.expiryDate,
  last_checked_at: o.lastCheckedAt,
  is_published: false,
}));

const cashbackRows: Row[] = cashbackOffers.map((o) => ({
  id: o.id,
  merchant_id: o.merchantId,
  provider: o.provider,
  rate_percent: o.ratePercent,
  flat_amount: o.flatAmount ?? null,
  cap_dollars: o.capDollars ?? null,
  is_upsized: o.isUpsized,
  excludes_gift_card_payment: o.excludesGiftCardPayment,
  terms_summary: o.termsSummary,
  expiry_date: o.expiryDate ?? null,
  citations: o.citations,
  confidence: o.confidence,
  last_checked_at: o.lastCheckedAt,
  is_published: true,
}));

const pointsRows: Row[] = pointsOffers.map((o) => ({
  id: o.id,
  merchant_id: o.merchantId ?? null,
  program: o.program,
  earn_rate_display: o.earnRateDisplay,
  earn_multiple: o.earnMultiple ?? null,
  point_value_cents: o.pointValueCents ?? null,
  mechanism: o.mechanism,
  expiry_date: o.expiryDate ?? null,
  citations: o.citations,
  confidence: o.confidence,
  last_checked_at: o.lastCheckedAt,
  is_published: true,
}));

const signalRows: (Row & SignalSeedRow)[] = ozBargainSignals.map((o) => ({
  id: o.id,
  source_native_id: o.sourceNativeId ?? null,
  merchant_id: o.merchantId ?? null,
  title: o.title,
  summary: o.summary,
  votes_sample: o.votesSample ?? null,
  comment_count: o.commentCount ?? null,
  sentiment: o.sentiment,
  deal_kind: o.dealKind,
  source_url: o.sourceUrl,
  merchant_url: o.merchantUrl ?? null,
  product_url: o.productUrl ?? null,
  posted_at: o.postedAt ?? null,
  expiry_date: o.expiryDate ?? null,
  tags: o.tags ?? [],
  promo_code: o.promoCode ?? null,
  price_text: o.priceText ?? null,
  signal_score: o.signalScore ?? null,
  confidence: o.confidence,
  last_checked_at: o.lastCheckedAt,
  is_sample: o.isSample,
  status: o.status ?? "approved",
}));

const weeklyRows: Row[] = weeklyDeals.map((o) => ({
  id: o.id,
  week_of: o.weekOf,
  merchant_id: o.merchantId ?? null,
  title: o.title,
  summary: o.summary,
  highlight: o.highlight,
  component_ids: o.componentIds,
  citations: o.citations,
  expiry_date: o.expiryDate ?? null,
  confidence: o.confidence,
  is_published: true,
}));

async function main(): Promise<void> {
  // Read env here so a missing var is reported by the friendly catch below.
  const supabase = createClient<LooseDB>(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  if (OVERWRITE) {
    console.log(
      [
        "⚠".repeat(32),
        "⚠ OVERWRITE MODE (--overwrite):",
        "⚠ Existing rows with matching ids will be RESET to the static values,",
        "⚠ including is_published. Admin edits and any cleanup-old-deals",
        "⚠ unpublishes on those rows WILL BE LOST.",
        "⚠".repeat(32),
        "",
      ].join("\n")
    );
  }
  console.log(
    `Seeding Supabase from static data (${
      OVERWRITE ? "OVERWRITE" : "insert-only; pass --overwrite to reset seeded rows"
    })…\n`
  );
  // Stores first (other tables reference merchant_id).
  await seedTable(supabase, "stores", storeRows);
  await seedTable(supabase, "gift_card_offers", giftCardRows);
  await seedTable(supabase, "cashback_offers", cashbackRows);
  await seedTable(supabase, "points_offers", pointsRows);
  // This table also has a unique source_native_id. Pre-filter collisions owned
  // by a different id; onConflict:id cannot handle that second constraint.
  const { data: existingSignals, error: existingSignalsError } = await supabase
    .from("ozbargain_signals")
    .select("id, source_native_id")
    .not("source_native_id", "is", null);
  if (existingSignalsError) {
    throw new Error(
      `Failed reading existing signal keys: ${existingSignalsError.message}`
    );
  }
  const { seedable, skipped } = filterSeedableSignals(
    signalRows,
    (existingSignals ?? []) as unknown as SignalSeedRow[]
  );
  for (const { row, ownedById } of skipped) {
    console.log(
      `• ozbargain_signals: skipped "${row.id}" — source_native_id "${row.source_native_id}" already belongs to row "${ownedById}"`
    );
  }
  await seedTable(supabase, "ozbargain_signals", seedable);
  await seedTable(supabase, "weekly_deals", weeklyRows);

  // card_offers needs migration 007 applied first (not done automatically —
  // see supabase/migrations/007_card_offers.sql). Isolated in its own
  // try/catch, last, so a not-yet-applied migration never aborts the seeding
  // of every other table above.
  try {
    await seedTable(supabase, "card_offers", cardOfferRows);
  } catch (err) {
    console.warn(
      `\n• card_offers: skipped (${err instanceof Error ? err.message : String(err)}). ` +
        "Apply supabase/migrations/007_card_offers.sql first, then re-run."
    );
  }

  console.log(
    OVERWRITE
      ? "\nDone (overwrite mode — seeded rows were reset to static values)."
      : "\nDone. Insert-only: re-running is always safe; existing rows were not touched."
  );
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
