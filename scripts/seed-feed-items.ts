/**
 * Seed FAKE feed_items for manually testing the admin review queue.
 *
 * Inserts one DISABLED example feed_source plus a handful of clearly-fake
 * feed_items (review_state = 'new') so /admin/signals/queue has something to
 * review. This is test data only — there is NO OzBargain fetching, no cron, no
 * agent, and no external request of any kind. It talks only to your own Supabase
 * project using the service-role key.
 *
 * Everything here is obviously synthetic: example.com links (never real or fake
 * OzBargain URLs) and `example-seed-*` source_native_id values. The example feed
 * source is is_enabled = false and stays that way.
 *
 * Safe to re-run:
 *   - the feed_source upserts on id (re-asserts the example, disabled);
 *   - feed_items insert ON CONFLICT (source_native_id) DO NOTHING, so a re-run
 *     never duplicates and never clobbers an item an admin has already triaged
 *     (imported / ignored / duplicate).
 *
 * Required environment variables (put them in .env.local, see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL      - your project URL
 *   SUPABASE_SERVICE_ROLE_KEY     - service role key (server/script ONLY)
 *
 * Run:
 *   1. Apply migrations 001 + 002 to your project first.
 *   2. npm run seed:feed-items
 */

import { createClient } from "@supabase/supabase-js";
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

// Fixed id so feed_items can reference it and re-runs stay idempotent. Obviously
// synthetic, and the URL is a placeholder example.com address — not a feed.
const EXAMPLE_FEED_SOURCE_ID = "11111111-1111-1111-1111-111111111111";

const exampleFeedSource: Row = {
  id: EXAMPLE_FEED_SOURCE_ID,
  label: "[EXAMPLE — DISABLED] DealStack seed feed (manual test data only)",
  feed_url: "https://example.com/dealstack-seed-feed.xml",
  kind: "front",
  is_enabled: false,
};

// 5 obviously-fake staged items. Realistic titles/summaries so the queue UI is
// worth looking at, but example.com links and example-seed-* native ids.
const exampleFeedItems: Row[] = [
  {
    feed_source_id: EXAMPLE_FEED_SOURCE_ID,
    source_native_id: "example-seed-myer-10",
    link: "https://example.com/deals/myer-10-percent-off",
    raw_title: "10% off sitewide at Myer with code MYER10",
    raw_summary:
      "Community-posted code for 10% off most full-priced items online. Exclusions apply; ends soon.",
    categories: ["discount code", "myer", "fashion"],
    posted_at: "2026-06-10T09:00:00+10:00",
    fetched_at: "2026-06-14T22:00:00+10:00",
    review_state: "new",
  },
  {
    feed_source_id: EXAMPLE_FEED_SOURCE_ID,
    source_native_id: "example-seed-jbhifi-giftcard",
    link: "https://example.com/deals/jb-hifi-gift-cards-5-off",
    raw_title: "JB Hi-Fi gift cards 5% off for members",
    raw_summary:
      "Discounted JB Hi-Fi eGift cards via a member benefits portal — handy for stacking on tech buys.",
    categories: ["gift card", "jb hi-fi", "electronics"],
    posted_at: "2026-06-11T14:30:00+10:00",
    fetched_at: "2026-06-14T22:00:00+10:00",
    review_state: "new",
  },
  {
    feed_source_id: EXAMPLE_FEED_SOURCE_ID,
    source_native_id: "example-seed-woolies-points",
    link: "https://example.com/deals/woolworths-10x-everyday-rewards",
    raw_title: "10x Everyday Rewards points on a $50+ shop at Woolworths",
    raw_summary:
      "Activate in the app, then spend $50 or more in one shop this week to earn 10x points. Activation required.",
    categories: ["points", "woolworths", "groceries"],
    posted_at: "2026-06-12T08:15:00+10:00",
    fetched_at: "2026-06-14T22:00:00+10:00",
    review_state: "new",
  },
  {
    feed_source_id: EXAMPLE_FEED_SOURCE_ID,
    source_native_id: "example-seed-velocity-transfer",
    link: "https://example.com/deals/velocity-15-percent-transfer-bonus",
    raw_title: "Velocity 15% transfer bonus from bank rewards programs",
    raw_summary:
      "Convert eligible bank reward points to Velocity with a 15% bonus before the end of the month.",
    categories: ["points", "velocity", "frequent flyer"],
    posted_at: "2026-06-09T18:45:00+10:00",
    fetched_at: "2026-06-14T22:00:00+10:00",
    review_state: "new",
  },
  {
    feed_source_id: EXAMPLE_FEED_SOURCE_ID,
    source_native_id: "example-seed-goodguys-5",
    link: "https://example.com/deals/the-good-guys-5-off-appliances",
    raw_title: "The Good Guys 5% off appliances flash sale",
    raw_summary:
      "Short-dated flash promo for 5% off selected appliances with a checkout code. Verify before relying on it.",
    categories: ["discount code", "the good guys", "appliances"],
    posted_at: "2026-06-13T11:00:00+10:00",
    fetched_at: "2026-06-14T22:00:00+10:00",
    review_state: "new",
  },
];

async function main(): Promise<void> {
  const supabase = createClient<LooseDB>(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  console.log("Seeding FAKE feed_items for the admin review queue…\n");

  // 1) The disabled example feed source (FK target for the items below).
  const { error: sourceError } = await supabase
    .from("feed_sources")
    .upsert([exampleFeedSource], { onConflict: "id", ignoreDuplicates: false });
  if (sourceError) {
    throw new Error(`Failed seeding feed_sources: ${sourceError.message}`);
  }
  console.log("✓ feed_sources: ensured 1 disabled example source");

  // 2) The fake staged items. DO NOTHING on conflict so re-runs never duplicate
  //    and never undo an admin's triage of an already-seeded item.
  const { data, error: itemsError } = await supabase
    .from("feed_items")
    .upsert(exampleFeedItems, {
      onConflict: "source_native_id",
      ignoreDuplicates: true,
    })
    .select("id");
  if (itemsError) {
    throw new Error(`Failed seeding feed_items: ${itemsError.message}`);
  }
  const inserted = data?.length ?? 0;
  console.log(
    `✓ feed_items: ${inserted} new of ${exampleFeedItems.length} ` +
      `(existing items left untouched)`
  );

  console.log("\nDone. Open /admin/signals/queue to review them.");
}

main().catch((err) => {
  console.error(
    "\nFeed item seed failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
