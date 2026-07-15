import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GcdbFeedItem } from "@/lib/giftcards/parseGcdbFeed";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import { persistRejectedRawItem } from "@/lib/admin/repos/giftCardPipeline";

const NOW = new Date("2026-07-15T03:04:05.000Z");
const ITEM: GcdbFeedItem = {
  externalId: "12870",
  canonicalUrl: "https://gcdb.com.au/offer/12870/",
  title: "Structured offer title",
  publishedAt: "2026-07-14T22:00:00.000Z",
  offerType: "unknown",
  sellerName: "Coles",
  giftCardBrands: ["Example"],
  startsAt: "2026-07-15",
  endsAt: "2026-07-21",
  isOngoing: false,
  sourceMarkedExpired: false,
  excerpt: "A bounded factual excerpt.",
};

function archiveQuery() {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(async () => ({ error: null })),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function updateRawQuery() {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data: { id: "raw-1" }, error: null })),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function insertRawQuery() {
  const query = {
    upsert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data: { id: "raw-new" }, error: null })),
  };
  query.upsert.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

describe("rejected gift-card raw-item persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives only open private candidates before rejecting an existing row", async () => {
    const candidates = archiveQuery();
    const raw = updateRawQuery();
    mocks.from.mockImplementation((table: string) => {
      if (table === "gift_card_offer_candidates") return candidates;
      if (table === "gift_card_raw_items") return raw;
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(
      persistRejectedRawItem(
        "gcdb",
        ITEM,
        "a".repeat(64),
        2,
        "unknown promotion mechanic",
        NOW,
        "raw-1",
      ),
    ).resolves.toBe("raw-1");

    expect(candidates.update).toHaveBeenCalledWith({
      review_status: "archived",
      rejection_reason: "superseded by a rejected source extraction",
    });
    expect(candidates.eq).toHaveBeenCalledWith("raw_item_id", "raw-1");
    expect(candidates.in).toHaveBeenCalledWith("review_status", [
      "new",
      "changed",
    ]);
    expect(raw.update).toHaveBeenCalledWith(
      expect.objectContaining({
        canonical_url: ITEM.canonicalUrl,
        title: ITEM.title,
        published_at: ITEM.publishedAt,
        content_hash: "a".repeat(64),
        parser_version: 2,
        last_seen_at: NOW.toISOString(),
        processing_status: "rejected",
        parser_error: "unknown promotion mechanic",
        raw_payload: {
          item: ITEM,
          extraction: null,
          extractions: [],
        },
      }),
    );
    expect(mocks.from).not.toHaveBeenCalledWith("gift_card_offers");
  });

  it("idempotently upserts a new rejection on the source/external identity", async () => {
    const raw = insertRawQuery();
    mocks.from.mockImplementation((table: string) => {
      if (table === "gift_card_raw_items") return raw;
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(
      persistRejectedRawItem(
        "gcdb",
        ITEM,
        "b".repeat(64),
        2,
        `reason ${"x".repeat(800)}`,
        NOW,
        null,
      ),
    ).resolves.toBe("raw-new");

    expect(raw.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: "gcdb",
        external_id: ITEM.externalId,
        first_seen_at: NOW.toISOString(),
        processing_status: "rejected",
        parser_version: 2,
      }),
      { onConflict: "source_id,external_id" },
    );
    const row = raw.upsert.mock.calls[0][0] as { parser_error: string };
    expect(row.parser_error).toHaveLength(500);
    expect(mocks.from).not.toHaveBeenCalledWith("gift_card_offer_candidates");
    expect(mocks.from).not.toHaveBeenCalledWith("gift_card_offers");
  });
});
