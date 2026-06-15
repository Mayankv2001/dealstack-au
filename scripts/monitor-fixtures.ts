/**
 * Fixture DRY RUN for the planned OzBargain feed monitor.
 *
 * Reads a LOCAL fixture XML file, runs it through the pure offline
 * parser/mapper, and prints what WOULD be staged into feed_items. It is a
 * read-only preview:
 *   - NO Supabase client, NO database writes;
 *   - NO fetch, NO network, NO OzBargain access;
 *   - nothing is enabled.
 *
 * The only I/O is reading the fixture file from disk. Run:
 *   npm run monitor:fixtures
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFeed } from "../lib/monitor/parseFeed";
import { mapFeedItems } from "../lib/monitor/mapFeedItem";

const DRY_RUN_BANNER = "DRY RUN ONLY — no network, no database writes";

// Local fixture only (resolved relative to this script — never fetched).
const FIXTURE_URL = new URL(
  "../tests/fixtures/ozbargain/sample-feed.xml",
  import.meta.url
);

function joinCategories(categories: string[]): string {
  return categories.length > 0 ? categories.join(", ") : "—";
}

function main(): void {
  const fixturePath = fileURLToPath(FIXTURE_URL);
  const xml = readFileSync(FIXTURE_URL, "utf-8");

  const parsed = parseFeed(xml);
  const mapped = mapFeedItems(parsed);

  console.log("=".repeat(64));
  console.log(" OzBargain feed monitor — FIXTURE DRY RUN");
  console.log(` ${DRY_RUN_BANNER}`);
  console.log("=".repeat(64));
  console.log(`Fixture:      ${fixturePath}`);
  console.log(`Parsed items: ${parsed.length}`);
  console.log(
    `Mapped items: ${mapped.length} (deduped by source_native_id)\n`
  );

  mapped.forEach((item, index) => {
    console.log(`${index + 1}. ${item.source_native_id}`);
    console.log(`   raw_title:    ${item.raw_title}`);
    console.log(`   link:         ${item.link || "—"}`);
    console.log(`   categories:   ${joinCategories(item.categories)}`);
    console.log(`   posted_at:    ${item.posted_at ?? "—"}`);
    console.log(`   content_hash: ${item.content_hash.slice(0, 12)}…`);
  });

  console.log(`\n${DRY_RUN_BANNER}. Nothing was fetched or written.`);
}

try {
  main();
} catch (err) {
  console.error(
    "\nFixture dry run failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
}
