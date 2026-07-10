import { describe, expect, it } from "vitest";
import { getCardOffers } from "@/lib/repos/offers";
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

const ILLUSTRATIVE_DB_CARD = {
  id: "db-illustrative-card",
  provider: "Example Bank",
  card_name: "Example Platinum",
  offer_type: "sign_up_bonus",
  bonus_points: 80000,
  cashback_amount: null,
  statement_credit_amount: null,
  minimum_spend: 3000,
  minimum_spend_period: "90 days",
  annual_fee: 249,
  eligibility_notes: "Sample only. Check current terms.",
  offer_summary: "Illustrative sign-up bonus.",
  source_url: "https://issuer.example/card",
  confidence: "needs-verification",
  expiry_date: null,
  last_checked_at: "2026-07-10T00:00:00.000Z",
};

function cardClient(rows: unknown[]): DbClient {
  return {
    from: () => ({
      select: async () => ({ data: rows, error: null }),
    }),
  } as unknown as DbClient;
}

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

  it("shows illustrative cards only in static/no-client demo modes", async () => {
    const explicitStatic = await getCardOffers({
      staticMode: true,
      client: FAKE_CLIENT,
      today: "2026-07-10",
    });
    const noClient = await getCardOffers({
      staticMode: false,
      client: null,
      today: "2026-07-10",
    });
    const configured = await getCardOffers({
      staticMode: false,
      client: cardClient([ILLUSTRATIVE_DB_CARD]),
      today: "2026-07-10",
    });

    expect(explicitStatic.some((offer) => offer.offerSummary.includes("Illustrative"))).toBe(
      true
    );
    expect(noClient).toEqual(explicitStatic);
    expect(configured).toEqual([]);
  });
});
