import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAcceptanceCandidateDrafts, parseMerchantList } from "@/lib/giftcards/parseMerchantList";
import { makeGiftCardAcceptance, makeStore } from "../stack/factories";

const snapshot = {
  content: "<ul><li>JB Hi-Fi — online and in-store</li><li>Nike Australia — not online | selected stores only</li></ul>",
  contentType: "html" as const,
  productId: "ultimate",
  sourceId: "reviewed-source",
  evidenceUrl: "https://example.test/cards/ultimate",
  capturedAt: "2026-07-15T00:00:00Z",
  evidenceSourceType: "gcdb" as const,
};

describe("merchant-list capture parser", () => {
  it("parses the trimmed captured-source fixture without retaining source prose", () => {
    const content = readFileSync(
      resolve(process.cwd(), "tests/fixtures/gcdb-jb-hifi-acceptance-trimmed.html"),
      "utf8",
    );
    expect(parseMerchantList({ ...snapshot, content })).toEqual([
      {
        rawMerchantName: "JB Hi-Fi",
        acceptsOnline: true,
        acceptsInStore: true,
        acceptsApp: null,
        acceptsPhone: true,
        limitations: "in-store, online and over the phone",
      },
    ]);
  });

  it("parses explicit channel and limitation hints without fetching", () => {
    expect(parseMerchantList(snapshot)).toEqual([
      { rawMerchantName: "JB Hi-Fi", acceptsOnline: true, acceptsInStore: true, acceptsApp: null, acceptsPhone: null, limitations: "online and in-store" },
      { rawMerchantName: "Nike Australia", acceptsOnline: false, acceptsInStore: true, acceptsApp: null, acceptsPhone: null, limitations: "not online — selected stores only" },
    ]);
  });

  it("stamps evidence from snapshot metadata and keeps unresolved names", () => {
    const entries = parseMerchantList(snapshot);
    const drafts = buildAcceptanceCandidateDrafts(
      snapshot,
      entries,
      [makeStore({ id: "jb-hifi", name: "JB Hi-Fi", aliases: ["JB HiFi"] })],
      [],
    );
    expect(drafts[0]).toMatchObject({ resolutionState: "resolved", resolvedStoreId: "jb-hifi", changeKind: "new" });
    expect(drafts[0].proposedValues).toMatchObject({ evidence_source_type: "gcdb", evidence_url: snapshot.evidenceUrl, evidence_captured_at: snapshot.capturedAt });
    expect(drafts[1]).toMatchObject({ resolutionState: "unresolved", rawMerchantName: "Nike Australia" });
  });

  it("creates removals only for an explicitly complete reviewed snapshot", () => {
    const current = [makeGiftCardAcceptance({ id: "old", productId: "ultimate", storeId: "myer", merchantName: "Myer" })];
    expect(buildAcceptanceCandidateDrafts(snapshot, parseMerchantList(snapshot), [makeStore({ id: "jb-hifi", name: "JB Hi-Fi" })], current).some((draft) => draft.changeKind === "removed")).toBe(false);
    expect(buildAcceptanceCandidateDrafts({ ...snapshot, completeSnapshot: true }, parseMerchantList(snapshot), [makeStore({ id: "jb-hifi", name: "JB Hi-Fi" })], current)).toEqual(expect.arrayContaining([expect.objectContaining({ changeKind: "removed", linkedAcceptanceId: "old" })]));
  });
});
