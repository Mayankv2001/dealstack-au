/**
 * Seed FAKE offer_change_candidates for manually testing /admin/offer-changes.
 *
 * Inserts a handful of clearly-synthetic, staged offer-change candidates
 * (review_state = 'new') so the admin review queue has cashback / gift-card /
 * points / promo rows to Apply, Ignore or Mark duplicate. This is test data
 * only — there is NO external fetching, NO scraping, NO cron, and NO agent. It
 * talks only to your own Supabase project using the service-role key, exactly
 * like the other seed scripts.
 *
 * What it does NOT do:
 *   - it never updates a published cashback/gift-card/points/promo offer (only
 *     an admin Apply on /admin/offer-changes does that);
 *   - it never auto-applies anything;
 *   - it makes no network request to any retailer/provider. Every detected_url
 *     is a placeholder example.com address, never a real or fake retailer URL.
 *   - Cashrewards is never referenced.
 *
 * Idempotent: candidates are de-duplicated in memory by content_hash (the same
 * guard the monitor uses) and then upserted ON CONFLICT (content_hash) DO
 * NOTHING, so re-runs never duplicate and never clobber an admin's triage of an
 * already-seeded candidate. To make Apply genuinely testable, each candidate's
 * target_id + previous_value are resolved from the matching live offer row when
 * present; if that offer hasn't been seeded yet the candidate still stages with
 * a null target (Apply then shows "unavailable", demonstrating the guard).
 *
 * Required environment variables (put them in .env.local, see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL      - your project URL
 *   SUPABASE_SERVICE_ROLE_KEY     - service role key (server/script ONLY)
 *
 * Run:
 *   1. Apply migrations 001–004 to your project first.
 *   2. (Recommended) npm run seed   — so the offers exist to target.
 *   3. npm run seed:offer-changes
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildOfferChangeCandidates,
  type DetectedOffer,
} from "../lib/monitor/offerChanges";
import { supabaseServiceRoleKey, supabaseUrl } from "../lib/env";

// Load .env.local for standalone runs (Next loads it for the app, scripts don't).
type WithLoadEnv = { loadEnvFile?: (path?: string) => void };
try {
  (process as unknown as WithLoadEnv).loadEnvFile?.(".env.local");
} catch {
  // .env.local not found — fall back to shell-provided environment variables.
}

type Row = Record<string, unknown>;

// Permissive schema so dynamic table names accept Row[] (no generated types yet).
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

/** First row matching `filters`, or null. Read-only; warns and continues on error. */
async function firstRow(
  supabase: DbClient,
  table: string,
  filters: Row,
  select: string
): Promise<Row | null> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .match(filters)
    .limit(1);
  if (error) {
    console.warn(`  (could not read ${table}: ${error.message})`);
    return null;
  }
  return (data?.[0] as unknown as Row) ?? null;
}

async function main(): Promise<void> {
  const supabase = createClient<LooseDB>(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  console.log("Seeding FAKE offer_change_candidates for the review queue…\n");

  // Resolve real target offers (read-only) so previous_value is accurate and
  // Apply actually updates a row. Each lookup is independent and optional.
  const cashback = await firstRow(
    supabase,
    "cashback_offers",
    { merchant_id: "myer", provider: "ShopBack" },
    "id, rate_percent"
  );
  const giftCard = await firstRow(
    supabase,
    "gift_card_offers",
    { brand: "Ultimate" },
    "id, discount_percent"
  );
  const points = await firstRow(
    supabase,
    "points_offers",
    { merchant_id: "woolworths" },
    "id, earn_multiple, earn_rate_display"
  );
  const promoStore = await firstRow(
    supabase,
    "stores",
    { id: "the-good-guys" },
    "id, discount_percent"
  );

  const pct = (v: unknown): string | null =>
    v == null ? null : `${Number(v)}%`;

  // Points "current" value: prefer the human display string, else the multiple.
  let pointsPrev: string | null = null;
  if (points) {
    const display = points.earn_rate_display;
    if (typeof display === "string" && display.length > 0) {
      pointsPrev = display;
    } else if (points.earn_multiple != null) {
      pointsPrev = `${Number(points.earn_multiple)}x`;
    }
  }

  // Clearly-synthetic detected changes. detected_url is always example.com.
  const detected: DetectedOffer[] = [
    {
      sourceType: "cashback",
      sourceName: "ShopBack",
      merchantId: "myer",
      targetId: (cashback?.id as string) ?? null,
      detectedTitle: "ShopBack cashback at Myer increased to 9%",
      detectedRateOrDiscount: "9%",
      detectedUrl: "https://example.com/seed/offer-change/shopback-myer",
      previousValue: pct(cashback?.rate_percent),
      proposedValue: "9%",
      confidence: "needs-verification",
      rawSummary:
        "Seed test data — sample detected increase in the Myer ShopBack rate. Verify before applying.",
    },
    {
      sourceType: "gift_card",
      sourceName: "RACV Member Benefits",
      merchantId: "jb-hifi",
      targetId: (giftCard?.id as string) ?? null,
      detectedTitle: "Ultimate gift card discount up to 7%",
      detectedRateOrDiscount: "7%",
      detectedUrl: "https://example.com/seed/offer-change/ultimate-giftcard",
      previousValue: pct(giftCard?.discount_percent),
      proposedValue: "7%",
      confidence: "needs-verification",
      rawSummary:
        "Seed test data — sample detected deeper discount on Ultimate gift cards (used at JB Hi-Fi / The Good Guys).",
    },
    {
      sourceType: "points",
      sourceName: "FreePoints",
      merchantId: "woolworths",
      targetId: (points?.id as string) ?? null,
      detectedTitle: "Everyday Rewards boost at Woolworths up to 25x",
      detectedRateOrDiscount: "25x",
      detectedUrl: "https://example.com/seed/offer-change/woolworths-points",
      previousValue: pointsPrev,
      proposedValue: "25x",
      confidence: "needs-verification",
      rawSummary:
        "Seed test data — sample detected uplift on an activated Everyday Rewards offer.",
    },
    {
      sourceType: "promo",
      sourceName: "OzBargain",
      merchantId: "the-good-guys",
      targetId: (promoStore?.id as string) ?? null,
      detectedTitle: "The Good Guys promo: extra 8% off appliances",
      detectedRateOrDiscount: "8%",
      detectedUrl: "https://example.com/seed/offer-change/good-guys-promo",
      previousValue: pct(promoStore?.discount_percent),
      proposedValue: "8%",
      confidence: "needs-verification",
      rawSummary:
        "Seed test data — sample detected store-wide promo code at The Good Guys. Verify before applying.",
    },
    // Duplicate-like: same source + merchant + url + proposed value as the first
    // candidate, so it collapses to ONE row by content_hash (demonstrates the
    // dedupe guard). Title differs on purpose — the hash ignores it.
    {
      sourceType: "cashback",
      sourceName: "ShopBack",
      merchantId: "myer",
      targetId: (cashback?.id as string) ?? null,
      detectedTitle: "[DUPLICATE] Myer ShopBack now 9% (same change, reposted)",
      detectedRateOrDiscount: "9%",
      detectedUrl: "https://example.com/seed/offer-change/shopback-myer",
      previousValue: pct(cashback?.rate_percent),
      proposedValue: "9%",
      confidence: "needs-verification",
      rawSummary: "Seed test data — duplicate of the Myer cashback candidate.",
    },
  ];

  // Same in-memory dedupe the monitor uses: collapses the duplicate by content_hash.
  const candidates = buildOfferChangeCandidates(detected);
  console.log(
    `Prepared ${detected.length} detected changes → ${candidates.length} ` +
      `unique after content_hash dedupe.`
  );

  // Stage them. DO NOTHING on conflict so re-runs never duplicate and never undo
  // an admin's triage. NEVER touches a published offer.
  const { data, error } = await supabase
    .from("offer_change_candidates")
    .upsert(
      candidates.map((c) => ({ ...c, review_state: "new" })),
      { onConflict: "content_hash", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    throw new Error(`Failed seeding offer_change_candidates: ${error.message}`);
  }

  const inserted = data?.length ?? 0;
  const withTarget = candidates.filter((c) => c.target_id != null).length;
  console.log(
    `✓ offer_change_candidates: ${inserted} new of ${candidates.length} ` +
      `(existing left untouched)`
  );
  console.log(
    `  ${withTarget}/${candidates.length} have a resolved target offer ` +
      `(Apply enabled); the rest stage with no target (Apply shown as unavailable).`
  );
  if (withTarget < candidates.length) {
    console.log(
      "  Tip: run `npm run seed` first so the offers exist to target."
    );
  }

  console.log("\nDone. Open /admin/offer-changes to review them.");
}

main().catch((err) => {
  console.error(
    "\nOffer-change seed failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
