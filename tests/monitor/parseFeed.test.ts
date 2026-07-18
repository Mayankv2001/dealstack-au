import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFeed } from "../../lib/monitor/parseFeed";
import {
  mapFeedItem,
  mapFeedItems,
  makeSourceNativeId,
  stripHtml,
} from "../../lib/monitor/mapFeedItem";

// Local fixture only — never fetched. Read relative to this test file.
const sampleXml = readFileSync(
  new URL("../fixtures/ozbargain/sample-feed.xml", import.meta.url),
  "utf-8"
);

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Sample Atom</title>
  <entry>
    <title>Velocity 15% transfer bonus from bank rewards</title>
    <link href="https://www.ozbargain.com.au/node/900010" rel="alternate"/>
    <id>tag:ozbargain,900010</id>
    <summary>Earn a 15% bonus converting eligible bank points to Velocity.</summary>
    <updated>2026-06-09T18:45:00+10:00</updated>
    <category term="points"/>
    <category term="velocity"/>
  </entry>
</feed>`;

describe("parseFeed (RSS)", () => {
  it("parses every item in the fixture", () => {
    expect(parseFeed(sampleXml)).toHaveLength(4);
  });

  it("reads a normal item's core fields", () => {
    const [first] = parseFeed(sampleXml);
    expect(first.title).toBe("10% off sitewide at Myer with code MYER10");
    expect(first.link).toBe("https://www.ozbargain.com.au/node/900001");
    expect(first.guid).toBe("900001");
    expect(first.summary).toContain("10% off most full-priced items");
    expect(first.published).toBe("Wed, 10 Jun 2026 09:00:00 +1000");
    expect(first.categories).toEqual(["Discount Code", "Myer"]);
  });

  it("returns [] for non-feed input", () => {
    expect(parseFeed("<html><body>not a feed</body></html>")).toEqual([]);
    expect(parseFeed("")).toEqual([]);
  });
});

describe("parseFeed (Atom)", () => {
  it("parses an Atom entry's core fields", () => {
    const items = parseFeed(ATOM_XML);
    expect(items).toHaveLength(1);
    const [entry] = items;
    expect(entry.title).toBe("Velocity 15% transfer bonus from bank rewards");
    expect(entry.link).toBe("https://www.ozbargain.com.au/node/900010");
    expect(entry.guid).toBe("tag:ozbargain,900010");
    expect(entry.summary).toContain("15% bonus");
    expect(entry.categories).toEqual(["points", "velocity"]);
    expect(mapFeedItem(entry).source_native_id).toBe(
      "ozb:tag:ozbargain,900010"
    );
  });
});

describe("stripHtml", () => {
  it("removes tags and decodes basic entities", () => {
    expect(stripHtml("<p>Save <strong>10%</strong> &amp; more</p>")).toBe(
      "Save 10% & more"
    );
  });

  it("returns an empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("mapFeedItem", () => {
  it("strips HTML from the description into a plain raw_summary", () => {
    const jbHifi = parseFeed(sampleXml)[1];
    const mapped = mapFeedItem(jbHifi);
    expect(mapped.raw_summary).toBe(
      "Discounted JB Hi-Fi eGift cards via a member portal."
    );
    expect(mapped.raw_summary).not.toContain("<");
    expect(mapped.raw_summary.toLowerCase()).not.toContain("strong");
  });

  it("falls back to the title when the description is missing", () => {
    const goodGuys = parseFeed(sampleXml)[3];
    const mapped = mapFeedItem(goodGuys);
    expect(mapped.raw_title).toBe("The Good Guys 5% off appliances");
    expect(mapped.raw_summary).toBe(mapped.raw_title);
    expect(mapped.raw_summary.length).toBeGreaterThan(0);
  });

  it("derives source_native_id from the guid and normalises posted_at", () => {
    const mapped = mapFeedItem(parseFeed(sampleXml)[0]);
    expect(mapped.source_native_id).toBe("ozb:900001");
    expect(mapped.posted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("produces a stable 64-char content_hash that changes with content", () => {
    const item = parseFeed(sampleXml)[0];
    const a = mapFeedItem(item).content_hash;
    const b = mapFeedItem(item).content_hash;
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
    const changed = mapFeedItem({ ...item, title: "Different title" })
      .content_hash;
    expect(changed).not.toBe(a);
  });

  it("falls back to a hashed id when guid and link are absent", () => {
    const id = makeSourceNativeId({
      title: "No ids here",
      link: null,
      guid: null,
      summary: "x",
      published: null,
      categories: [],
    });
    expect(id).toMatch(/^ozb:sha256:[a-f0-9]{64}$/);
  });
});

describe("mapFeedItems (dedupe)", () => {
  it("collapses items that share a guid", () => {
    const mapped = mapFeedItems(parseFeed(sampleXml));
    // 4 fixture items, two of which share guid 900001 → 3 unique.
    expect(mapped).toHaveLength(3);
    const myer = mapped.filter((m) => m.source_native_id === "ozb:900001");
    expect(myer).toHaveLength(1);
  });
});
