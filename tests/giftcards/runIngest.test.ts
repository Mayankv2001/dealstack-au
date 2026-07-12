import { describe, expect, it } from "vitest";
import {
  contentHashOf,
  runGiftCardIngest,
  type RawItemState,
  type RunIngestDeps,
  type StagedCandidate,
} from "@/lib/giftcards/runIngest";
import { extractOffer, extractOffers } from "@/lib/giftcards/extractOffer";
import { parseGcdbFeed } from "@/lib/giftcards/parseGcdbFeed";

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
