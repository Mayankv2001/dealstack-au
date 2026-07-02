import { describe, expect, it } from "vitest";
import { fromDbOrDemo, type DbClient } from "@/lib/supabase/server";

/**
 * fromDbOrDemo — the trust rule behind the public /cards page: static demo
 * rows (illustrative figures) are ONLY a local/demo substitute. Once Supabase
 * is configured, the DB is authoritative — zero published rows means an empty
 * state, and a failed read returns no rows. The demo data must never be
 * served as if it were live.
 */

const DEMO = [{ id: "demo-card-offer" }];
const DB_ROWS = [{ id: "db-card-offer" }];
// The helper never touches the client itself — the injected query does — so a
// bare object stands in for a configured client.
const FAKE_CLIENT = {} as DbClient;

describe("fromDbOrDemo — demo data is never a live fallback", () => {
  it("returns demo data in explicit static mode (DATA_SOURCE=static)", async () => {
    const rows = await fromDbOrDemo("test", DEMO, async () => DB_ROWS, {
      staticMode: true,
    });
    expect(rows).toEqual(DEMO);
  });

  it("returns demo data when Supabase is not configured (no client)", async () => {
    const rows = await fromDbOrDemo("test", DEMO, async () => DB_ROWS, {
      staticMode: false,
      client: null,
    });
    expect(rows).toEqual(DEMO);
  });

  it("returns the DB rows when Supabase is configured", async () => {
    const rows = await fromDbOrDemo("test", DEMO, async () => DB_ROWS, {
      staticMode: false,
      client: FAKE_CLIENT,
    });
    expect(rows).toEqual(DB_ROWS);
  });

  it("returns EMPTY (not demo data) when the DB has zero published rows", async () => {
    const rows = await fromDbOrDemo("test", DEMO, async () => [], {
      staticMode: false,
      client: FAKE_CLIENT,
    });
    expect(rows).toEqual([]);
  });

  it("returns EMPTY (not demo data) when the DB read throws", async () => {
    const rows = await fromDbOrDemo(
      "test",
      DEMO,
      async () => {
        throw new Error('relation "card_offers" does not exist');
      },
      { staticMode: false, client: FAKE_CLIENT }
    );
    expect(rows).toEqual([]);
  });
});
