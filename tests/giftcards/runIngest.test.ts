import { describe, expect, it } from "vitest";
import {
  contentHashOf,
  runGiftCardIngest,
  type RawItemState,
  type RunIngestDeps,
  type StagedCandidate,
} from "@/lib/giftcards/runIngest";
import { extractOffer, extractOffers } from "@/lib/giftcards/extractOffer";
import { GCDB_PARSER_VERSION, parseGcdbFeed } from "@/lib/giftcards/parseGcdbFeed";

/**
 * The ingest orchestrator with fully injected deps — no network, no DB. Pins
 * the idempotency + trust rules: new items stage a 'new' candidate, unchanged
 * items only touch last_seen, and a material change to an APPROVED offer stages
 * a 'changed' candidate (it never rewrites the public offer directly).
 */

const SOURCE = { id: "gcdb", feedUrl: "https://gcdb.com.au/feed/", etag: null, lastModified: null };
const NOW = new Date("2026-07-12T00:00:00Z");

function feed(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>GCDB</title>${inner}</channel></rss>`;
}

function offerItem(externalId: string, title: string, endsAt = "17 Jul 2026"): string {
  return `<item>
    <title>${title}</title>
    <link>https://gcdb.com.au/offer/${externalId}/</link>
    <guid>https://gcdb.com.au/?p=${externalId}</guid>
    <description>${title}. Ends ${endsAt}.</description>
    <offer_type>Discount</offer_type>
    <offer_store>Coles</offer_store>
    <offer_gc>Coles Group</offer_gc>
  </item>`;
}

interface Recorder {
  inserts: Array<{ externalId: string }>;
  updates: string[];
  touches: string[];
  rejections: Array<{
    sourceId: string;
    externalId: string;
    contentHash: string;
    parserVersion: number;
    parserError: string;
    seenAt: Date;
    existingRawItemId: string | null;
  }>;
  staged: StagedCandidate[];
  sourceState: Array<{ ok: boolean; error?: string }>;
}

function makeDeps(
  fetchOutcome: Awaited<ReturnType<RunIngestDeps["fetchFeed"]>>,
  existing: RawItemState[] = []
): { deps: RunIngestDeps; rec: Recorder } {
  const rec: Recorder = {
    inserts: [],
    updates: [],
    touches: [],
    rejections: [],
    staged: [],
    sourceState: [],
  };
  const byExternalId = new Map(existing.map((e) => [e.externalId, e]));
  const deps: RunIngestDeps = {
    now: () => NOW,
    fetchFeed: async () => fetchOutcome,
    loadRawItems: async (_sourceId, externalIds) =>
      externalIds.map((id) => byExternalId.get(id)).filter((x): x is RawItemState => Boolean(x)),
    insertRawItem: async (_sourceId, item) => {
      rec.inserts.push({ externalId: item.externalId });
      return `raw-${item.externalId}`;
    },
    updateRawItem: async (id) => {
      rec.updates.push(id);
    },
    persistRejectedRawItem: async (
      sourceId,
      item,
      contentHash,
      parserVersion,
      parserError,
      seenAt,
      existingRawItemId,
    ) => {
      rec.rejections.push({
        sourceId,
        externalId: item.externalId,
        contentHash,
        parserVersion,
        parserError,
        seenAt,
        existingRawItemId,
      });
      return existingRawItemId ?? `raw-${item.externalId}`;
    },
    touchRawItem: async (id) => {
      rec.touches.push(id);
    },
    stageCandidate: async (_sourceId, candidate) => {
      rec.staged.push(candidate);
    },
    recordSourceState: async (_sourceId, patch) => {
      rec.sourceState.push({ ok: patch.ok, error: patch.error });
    },
  };
  return { deps, rec };
}

const okFetch = (body: string) =>
  ({ kind: "ok", body, etag: "etag-1", lastModified: "lm-1" }) as const;

describe("runGiftCardIngest — new item", () => {
  it("inserts the raw item and stages a NEW candidate", async () => {
    const body = feed(offerItem("100", "10% off Coles Group gift cards"));
    const { deps, rec } = makeDeps(okFetch(body));
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics.status).toBe("ok");
    expect(metrics.itemsSeen).toBe(1);
    expect(metrics.itemsNew).toBe(1);
    expect(metrics.candidatesNew).toBe(1);
    expect(metrics.candidatesChanged).toBe(0);
    expect(rec.inserts).toEqual([{ externalId: "100" }]);
    expect(rec.staged).toHaveLength(1);
    expect(rec.staged[0]).toMatchObject({ rawItemId: "raw-100", reviewStatus: "new", changeKind: null });
    expect(rec.sourceState).toEqual([{ ok: true, error: undefined }]);
  });
});

describe("runGiftCardIngest — conditional GET / fetch outcomes", () => {
  it("short-circuits on not-modified without staging anything", async () => {
    const { deps, rec } = makeDeps({ kind: "not-modified" });
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);
    expect(metrics.fetchStatus).toBe("not-modified");
    expect(metrics.itemsSeen).toBe(0);
    expect(rec.staged).toHaveLength(0);
    expect(rec.sourceState).toEqual([{ ok: true, error: undefined }]);
  });

  it("reports an error and records source failure when blocked", async () => {
    const { deps, rec } = makeDeps({ kind: "blocked", reason: "cloudflare challenge" });
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);
    expect(metrics.status).toBe("error");
    expect(metrics.fetchStatus).toBe("blocked");
    expect(metrics.errors).toContain("cloudflare challenge");
    expect(rec.sourceState).toEqual([{ ok: false, error: "cloudflare challenge" }]);
  });
});

describe("runGiftCardIngest — unchanged item", () => {
  it("only bumps last_seen when the content hash matches", async () => {
    const body = feed(offerItem("100", "10% off Coles Group gift cards"));
    const parsed = parseGcdbFeed(body)[0];
    const existing: RawItemState = {
      id: "raw-100",
      externalId: "100",
      contentHash: contentHashOf(parsed),
      processingStatus: "parsed",
      extraction: extractOffer(parsed),
      openCandidateId: null,
      approvedOfferId: "gc-coles",
    };
    const { deps, rec } = makeDeps(okFetch(body), [existing]);
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics.itemsUnchanged).toBe(1);
    expect(metrics.candidatesNew).toBe(0);
    expect(metrics.candidatesChanged).toBe(0);
    expect(rec.touches).toEqual(["raw-100"]);
    expect(rec.staged).toHaveLength(0);
  });
});

describe("runGiftCardIngest — material change to an APPROVED offer", () => {
  it("stages a CHANGED candidate rather than touching the public offer", async () => {
    const newBody = feed(offerItem("100", "12% off Coles Group gift cards"));
    // The prior extraction the raw item was approved from: an 8% discount.
    const beforeParsed = parseGcdbFeed(
      feed(offerItem("100", "8% off Coles Group gift cards"))
    )[0];
    const existing: RawItemState = {
      id: "raw-100",
      externalId: "100",
      contentHash: "stale-hash",
      processingStatus: "parsed",
      extraction: extractOffer(beforeParsed),
      openCandidateId: null,
      approvedOfferId: "gc-coles",
    };
    const { deps, rec } = makeDeps(okFetch(newBody), [existing]);
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics.itemsUpdated).toBe(1);
    expect(metrics.candidatesChanged).toBe(1);
    expect(rec.updates).toEqual(["raw-100"]);
    expect(rec.staged).toHaveLength(1);
    expect(rec.staged[0]).toMatchObject({
      reviewStatus: "changed",
      changeKind: "material-offer",
    });
    expect(rec.staged[0].changedFields).toContain("discountPercent");
  });
});

describe("runGiftCardIngest — cosmetic change to an APPROVED offer", () => {
  it("updates the raw item but does NOT re-open review", async () => {
    // Same extracted values, different wording → hash differs, extraction equal.
    const newBody = feed(offerItem("100", "10% off Coles Group gift cards (updated)"));
    const beforeParsed = parseGcdbFeed(
      feed(offerItem("100", "10% off Coles Group gift cards"))
    )[0];
    const existing: RawItemState = {
      id: "raw-100",
      externalId: "100",
      contentHash: "stale-hash",
      processingStatus: "parsed",
      extraction: extractOffer(beforeParsed),
      openCandidateId: null,
      approvedOfferId: "gc-coles",
    };
    const { deps, rec } = makeDeps(okFetch(newBody), [existing]);
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics.itemsUpdated).toBe(1);
    expect(metrics.candidatesNew).toBe(0);
    expect(metrics.candidatesChanged).toBe(0);
    expect(rec.staged).toHaveLength(0);
  });
});

describe("runGiftCardIngest — compound sub-offers", () => {
  const compoundChildren = (body: string) => {
    const parsed = parseGcdbFeed(body)[0];
    return extractOffers(parsed, [
      {
        key: "apple-credit",
        promotionType: "promo-credit",
        giftCardBrands: ["Apple"],
        promoCreditDollars: 10,
        thresholdDollars: 100,
        membershipRequired: true,
      },
      {
        key: "uber-discount",
        promotionType: "discount",
        giftCardBrands: ["Uber & Uber Eats"],
        discountPercent: 10,
        membershipRequired: true,
      },
    ]);
  };

  it("stages one private candidate per stable child key", async () => {
    const body = feed(
      offerItem(
        "12680",
        "$10 promo credit on $100 Apple and 10% off Uber gift cards"
      )
    );
    const { deps, rec } = makeDeps(okFetch(body));
    deps.extractItem = () => compoundChildren(body);
    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);
    expect(metrics.candidatesNew).toBe(2);
    expect(rec.staged.map((candidate) => candidate.extraction.subOfferKey)).toEqual([
      "apple-credit",
      "uber-discount",
    ]);
    expect(rec.staged.every((candidate) => candidate.extraction.parentIsCompound)).toBe(true);
  });

  it("flags a removed child for review without changing the public offer", async () => {
    const body = feed(offerItem("12680", "10% off Uber gift cards"));
    const prior = compoundChildren(body);
    const existing: RawItemState = {
      id: "raw-12680",
      externalId: "12680",
      contentHash: "old-version-hash",
      processingStatus: "parsed",
      extraction: prior[0],
      extractions: prior,
      openCandidateId: null,
      approvedOfferId: null,
      candidateLinks: [
        {
          subOfferKey: "apple-credit",
          openCandidateId: null,
          approvedOfferId: "gc-amazon-apple-credit",
        },
        {
          subOfferKey: "uber-discount",
          openCandidateId: null,
          approvedOfferId: "gc-amazon-uber",
        },
      ],
    };
    const { deps, rec } = makeDeps(okFetch(body), [existing]);
    deps.extractItem = () => [prior[1]];
    await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);
    const removed = rec.staged.find(
      (candidate) => candidate.changeKind === "source-removed"
    );
    expect(removed?.extraction).toMatchObject({
      subOfferKey: "apple-credit",
      sourcePresence: "removed",
    });
    expect(removed?.reviewStatus).toBe("changed");
  });
});

describe("runGiftCardIngest — a previously undated item gains dates on refresh", () => {
  it("stages a CHANGED candidate carrying the newly parsed dates for review", async () => {
    // Snapshot the item as the OLD parser stored it: same source text, but the
    // range was missed, so the approved offer carries null dates.
    const [freshItem] = parseGcdbFeed(
      feed(offerItem("12676", "10% off Restaurant Choice", "14 Jul 2026"))
    );
    const staleItem = { ...freshItem, startsAt: null, endsAt: null };
    const staleExtraction = extractOffer(staleItem);
    const existing: RawItemState = {
      id: "raw-12676",
      externalId: "12676",
      contentHash: contentHashOf(staleItem, 2),
      processingStatus: "parsed",
      extraction: staleExtraction,
      extractions: [staleExtraction],
      openCandidateId: null,
      approvedOfferId: "gc-restaurant-choice",
      candidateLinks: [
        { subOfferKey: "primary", openCandidateId: null, approvedOfferId: "gc-restaurant-choice" },
      ],
    };
    const { deps, rec } = makeDeps(
      okFetch(feed(offerItem("12676", "10% off Restaurant Choice", "14 Jul 2026"))),
      [existing]
    );

    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 10 }, deps);

    expect(metrics.itemsUpdated).toBe(1);
    expect(metrics.candidatesChanged).toBe(1);
    expect(rec.updates).toEqual(["raw-12676"]);
    expect(rec.staged).toHaveLength(1);
    const [staged] = rec.staged;
    expect(staged.reviewStatus).toBe("changed");
    expect(staged.extraction.expiresAt).toBe("2026-07-14");
    expect(staged.changedFields).toContain("expiresAt");
    // The public offer is never touched directly — review decides.
  });

  it("re-stages every item when only the parser version changes", async () => {
    // The content hash covers the parser version, so a parser upgrade forces
    // stale snapshots through extraction again even with identical feed text.
    const [itemNow] = parseGcdbFeed(
      feed(offerItem("12677", "20x points on TCN", "14 Jul 2026"))
    );
    const priorExtraction = extractOffer(itemNow);
    const existing: RawItemState = {
      id: "raw-12677",
      externalId: "12677",
      contentHash: contentHashOf(itemNow, 2),
      processingStatus: "parsed",
      extraction: priorExtraction,
      extractions: [priorExtraction],
      openCandidateId: null,
      approvedOfferId: null,
      candidateLinks: [
        { subOfferKey: "primary", openCandidateId: null, approvedOfferId: null },
      ],
    };
    const { deps, rec } = makeDeps(
      okFetch(feed(offerItem("12677", "20x points on TCN", "14 Jul 2026"))),
      [existing]
    );

    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 10 }, deps);

    expect(metrics.itemsUnchanged).toBe(0);
    expect(metrics.itemsUpdated).toBe(1);
    expect(rec.staged).toHaveLength(1);
    expect(rec.staged[0].reviewStatus).toBe("new");
  });
});

describe("runGiftCardIngest — rejection retention", () => {
  it("reports a non-empty response with zero parseable items as a parse error", async () => {
    const { deps, rec } = makeDeps(okFetch("<html>not the approved feed shape</html>"));
    deps.parseBody = () => [];

    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics).toMatchObject({
      status: "error",
      fetchStatus: "parse-error",
      itemsSeen: 0,
      itemsRejected: 0,
    });
    expect(metrics.errors).toEqual([
      "Source parse failed: non-empty response contained no parseable items.",
    ]);
    expect(rec.sourceState).toEqual([
      {
        ok: false,
        error: "Source parse failed: non-empty response contained no parseable items.",
      },
    ]);
    expect(rec.staged).toHaveLength(0);
  });

  it("turns a thrown source parser error into metrics instead of dropping the run context", async () => {
    const { deps, rec } = makeDeps(okFetch("structured source response"));
    deps.parseBody = () => {
      throw new Error("unexpected source layout");
    };

    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics.status).toBe("error");
    expect(metrics.fetchStatus).toBe("parse-error");
    expect(metrics.errors).toEqual([
      "Source parse failed: unexpected source layout",
    ]);
    expect(rec.sourceState).toEqual([
      { ok: false, error: "Source parse failed: unexpected source layout" },
    ]);
  });

  it("retains an attributable rejected item and stages no candidate", async () => {
    const body = feed(offerItem("999", "Offer missing an extractable mechanic"));
    const { deps, rec } = makeDeps(okFetch(body));
    deps.extractItem = () => [];

    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics).toMatchObject({
      status: "partial",
      fetchStatus: "ok",
      itemsSeen: 1,
      itemsRejected: 1,
      candidatesNew: 0,
    });
    expect(rec.inserts).toHaveLength(0);
    expect(rec.staged).toHaveLength(0);
    expect(rec.rejections).toEqual([
      expect.objectContaining({
        sourceId: "gcdb",
        externalId: "999",
        parserVersion: GCDB_PARSER_VERSION,
        parserError: "No review candidates were extracted from the source item.",
        seenAt: NOW,
        existingRawItemId: null,
      }),
    ]);
    expect(rec.rejections[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    // A partial parse retains the previous validators so the corrected parser
    // receives the full response on its next retry rather than a 304.
    expect(rec.sourceState).toEqual([
      {
        ok: false,
        error: "999: No review candidates were extracted from the source item.",
      },
    ]);
  });

  it("keeps valid siblings private while retaining one invalid sibling", async () => {
    const body = feed(
      `${offerItem("100", "10% off Coles Group gift cards")}${offerItem(
        "101",
        "Unrecognised offer mechanic",
      )}`,
    );
    const { deps, rec } = makeDeps(okFetch(body));
    deps.extractItem = (item) =>
      item.externalId === "101" ? [] : extractOffers(item);

    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics).toMatchObject({
      status: "partial",
      itemsSeen: 2,
      itemsNew: 1,
      itemsRejected: 1,
      candidatesNew: 1,
    });
    expect(rec.inserts).toEqual([{ externalId: "100" }]);
    expect(rec.rejections.map((item) => item.externalId)).toEqual(["101"]);
    expect(rec.staged).toHaveLength(1);
  });

  it("recovers a stable-hash rejected row to parsed and stages fresh review", async () => {
    const body = feed(offerItem("100", "10% off Coles Group gift cards"));
    const item = parseGcdbFeed(body)[0];
    const existing: RawItemState = {
      id: "raw-100",
      externalId: "100",
      contentHash: contentHashOf(item),
      processingStatus: "rejected",
      extraction: null,
      extractions: [],
      openCandidateId: null,
      approvedOfferId: null,
    };
    const { deps, rec } = makeDeps(okFetch(body), [existing]);

    const metrics = await runGiftCardIngest(SOURCE, { maxItems: 40 }, deps);

    expect(metrics).toMatchObject({
      status: "ok",
      itemsUpdated: 1,
      itemsUnchanged: 0,
      candidatesNew: 1,
    });
    expect(rec.updates).toEqual(["raw-100"]);
    expect(rec.touches).toHaveLength(0);
    expect(rec.staged[0]).toMatchObject({
      rawItemId: "raw-100",
      reviewStatus: "new",
    });
  });
});
