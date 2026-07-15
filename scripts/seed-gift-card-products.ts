/**
 * Reviewed gift-card product seed — DRY RUN BY DEFAULT.
 *
 * This script does not fetch any external page, publish a product, enable a
 * source, or modify an existing row. Its product identities are manually
 * reviewed against the cited issuer/seller URL embedded in source_evidence.
 * Unknown logistics fields are deliberately omitted so database defaults retain
 * their existing "unknown" semantics; do not add a fact without a cited URL.
 *
 * Usage:
 *   npm run seed:gift-card-products
 *   npm run seed:gift-card-products -- --write
 *   npm run seed:gift-card-products -- --offline  # no database connection
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "../lib/env";

type Row = Record<string, unknown>;
type LooseDatabase = {
  public: {
    Tables: Record<string, { Row: Row; Insert: Row; Update: Row; Relationships: [] }>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export interface ProductSeed {
  id: string;
  slug: string;
  brand: string;
  issuer: string | null;
  source_evidence: Array<{
    url: string;
    checkedAt: string;
    status: "reviewed";
    fields: string[];
  }>;
}

const CAPTURED_AT = "2026-07-15T00:00:00.000Z";

const reviewedProduct = (
  id: string,
  brand: string,
  sourceUrl: string,
  issuer: string | null = null
): ProductSeed => ({
  id,
  slug: id,
  brand,
  issuer,
  source_evidence: [
    {
      url: sourceUrl,
      checkedAt: CAPTURED_AT,
      status: "reviewed",
      fields: ["id", "brand", "slug", ...(issuer ? ["issuer"] : [])],
    },
  ],
});

const ULTIMATE_TERMS = "https://www.ultimategiftcards.com.au/terms-conditions/";

/**
 * Every row is a distinct product. In particular, Him and Her are never merged
 * merely because their names are similar. No denomination, format, acceptance,
 * wallet, activation, expiry, or fee fact is seeded unless separately cited.
 */
export const REVIEWED_PRODUCT_SEEDS: readonly ProductSeed[] = [
  reviewedProduct("tcn-shop", "TCN Shop", "https://thecardnetwork.com.au/products/the-shop-card"),
  reviewedProduct("tcn-love", "TCN Love", "https://thecardnetwork.com.au/products/the-love-card"),
  reviewedProduct("tcn-good-food", "TCN Good Food", "https://thecardnetwork.com.au/products/the-good-food-gift-card"),
  reviewedProduct("tcn-cinema", "TCN Cinema", "https://thecardnetwork.com.au/products/the-cinema-card"),
  reviewedProduct("tcn-him", "TCN Him", "https://thecardnetwork.com.au/products/the-him-card"),
  reviewedProduct("tcn-her", "TCN Her", "https://thecardnetwork.com.au/products/the-her-card"),
  reviewedProduct("ultimate-kids", "Ultimate Kids", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-teens", "Ultimate Teens", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-him", "Ultimate Him", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-her", "Ultimate Her", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-home", "Ultimate Home", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-students", "Ultimate Students", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-active-wellness", "Ultimate Active & Wellness", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-shopping-style", "Ultimate Shopping/Style", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-eats", "Ultimate Eats", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-baby-mum", "Ultimate Baby & Mum", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-thanks", "Ultimate Thanks", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-everyone", "Ultimate Everyone", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-beauty-spa", "Ultimate Beauty & Spa", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-gaming-bites", "Ultimate Gaming & Bites", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-happy-birthday", "Ultimate Happy Birthday", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-celebrate", "Ultimate Celebrate", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-just-for-you", "Ultimate Just For You", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("ultimate-thank-you", "Ultimate Thank You", ULTIMATE_TERMS, "Blackhawk Network (Australia) Pty Ltd"),
  reviewedProduct("restaurant-choice", "Restaurant Choice", "https://restaurantchoice.com.au/"),
  reviewedProduct("apple-gift-card", "Apple Gift Card", "https://www.apple.com/au/shop/gift-cards"),
  reviewedProduct("myer-gift-card", "Myer Gift Card", "https://www.myer.com.au/content/gift-cards"),
];

export type SeedChange = { id: string; action: "insert" | "skip-existing"; brand: string };

export const planSeedChanges = (existingIds: Iterable<string>): SeedChange[] => {
  const existing = new Set(existingIds);
  return REVIEWED_PRODUCT_SEEDS.map((product) => ({
    id: product.id,
    brand: product.brand,
    action: existing.has(product.id) ? "skip-existing" : "insert",
  }));
};

export const formatSeedPlan = (changes: readonly SeedChange[], write: boolean): string[] => [
  `Gift-card product seed — ${write ? "WRITE MODE" : "DRY RUN"}`,
  write
    ? "Only missing inactive products will be inserted; existing rows are untouched."
    : "No database writes. Pass --write only after reviewing this exact plan.",
  ...changes.map((change) => `${change.action === "insert" ? "INSERT" : "SKIP  "} ${change.id} — ${change.brand}`),
  `Summary: ${changes.filter((change) => change.action === "insert").length} insert(s), ${changes.filter((change) => change.action === "skip-existing").length} existing row(s).`,
];

function loadLocalEnv() {
  try {
    (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
  } catch {
    // Shell variables remain supported when .env.local is intentionally absent.
  }
}

function databaseAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

async function auditInsert(db: SupabaseClient<LooseDatabase>, product: ProductSeed) {
  const { error } = await db.from("audit_log").insert({
    actor_email: "script:seed-gift-card-products",
    action: "seed-create",
    table_name: "gift_card_products",
    row_id: product.id,
    diff: { brand: product.brand, sourceEvidence: product.source_evidence },
  });
  if (error) throw new Error(`audit insert failed for ${product.id}: ${error.message}`);
}

export async function runSeed(write: boolean, offline = false): Promise<SeedChange[]> {
  loadLocalEnv();
  if (offline) {
    if (write) throw new Error("--offline and --write cannot be used together.");
    const plan = planSeedChanges([]);
    formatSeedPlan(plan, false).forEach((line) => console.log(line));
    console.log("Offline preview: database diff was intentionally not requested.");
    return plan;
  }
  if (!databaseAvailable()) {
    if (write) throw new Error("--write requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    const plan = planSeedChanges([]);
    formatSeedPlan(plan, false).forEach((line) => console.log(line));
    console.log("Database diff unavailable because service credentials are not configured.");
    return plan;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient<LooseDatabase>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db
    .from("gift_card_products")
    .select("id")
    .in("id", REVIEWED_PRODUCT_SEEDS.map((product) => product.id));
  if (error) throw new Error(`read existing products failed: ${error.message}`);
  const changes = planSeedChanges((data ?? []).map((row) => String(row.id)));
  formatSeedPlan(changes, write).forEach((line) => console.log(line));
  if (!write) return changes;

  for (const change of changes.filter((item) => item.action === "insert")) {
    const product = REVIEWED_PRODUCT_SEEDS.find((item) => item.id === change.id)!;
    const { data: inserted, error: insertError } = await db
      .from("gift_card_products")
      .upsert(
        { ...product, is_active: false },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (insertError) throw new Error(`insert ${product.id} failed: ${insertError.message}`);
    if (!inserted) continue; // A concurrent operator inserted it; never overwrite.
    try {
      await auditInsert(db, product);
    } catch (error) {
      const rollback = await db.from("gift_card_products").delete().eq("id", product.id);
      if (rollback.error) {
        throw new Error(
          `audit insert failed and compensating delete failed for ${product.id}: ${rollback.error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
  }
  return changes;
}

if (process.argv.some((arg) => arg.endsWith("seed-gift-card-products.ts"))) {
  const write = process.argv.slice(2).includes("--write");
  const offline = process.argv.slice(2).includes("--offline");
  runSeed(write, offline).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
