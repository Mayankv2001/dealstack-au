import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFeed } from "../../lib/monitor/parseFeed";
import {
  mapFeedItem,
  mapFeedItems,
  makeSourceNativeId,
  stripHtml,
} from "../../lib/monitor/mapFeedItem";

// Local fixtures only — never fetched. Read relative to this test file.
const sampleXml = readFileSync(
  new URL("../fixtures/ozbargain/sample-feed.xml", import.meta.url),
  "utf-8"
);
const ozbExtensionXml = readFileSync(
  new URL(
    "../fixtures/ozbargain/sample-feed-ozb-extension.xml",
    import.meta.url
  ),
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

  it("captures an optional feed thumbnail without fetching it", () => {
    const xml = `<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
      <title>Deal</title><guid>thumb-1</guid>
      <media:thumbnail url="https://static.ozbargain.com.au/example.jpg" />
    </item></channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item.thumbnailUrl).toBe("https://static.ozbargain.com.au/example.jpg");
    expect(mapFeedItem(item).thumbnail_url).toBe(
      "https://static.ozbargain.com.au/example.jpg"
    );
  });
});

describe("parseFeed (ozb source-state extension)", () => {
  it("captures the declared expiry and the explicit expired marker", () => {
    const [outOfStock, vitamins] = parseFeed(ozbExtensionXml);
    expect(outOfStock.declaredExpiry).toBe("2026-07-11T13:23:46+10:00");
    expect(outOfStock.sourceMarkedExpired).toBe(true);
    expect(vitamins.declaredExpiry).toBe("2026-08-01T00:00:00+10:00");
    expect(vitamins.sourceMarkedExpired).toBe(false);
  });

  it("finds the expired marker among multiple title-msg markers", () => {
    const dualMarker = parseFeed(ozbExtensionXml)[2];
    expect(dualMarker.sourceMarkedExpired).toBe(true);
    expect(dualMarker.declaredExpiry).toBeNull();
  });

  it("ignores non-expired marker types (upcoming/targeted)", () => {
    const upcoming = parseFeed(ozbExtensionXml)[3];
    expect(upcoming.sourceMarkedExpired).toBe(false);
    expect(upcoming.declaredExpiry).toBeNull();
  });

  it("defaults to no source state on feeds without the extension", () => {
    const [first] = parseFeed(sampleXml);
    expect(first.declaredExpiry).toBeNull();
    expect(first.sourceMarkedExpired).toBe(false);
  });

  it("matches the extension by local name, not the literal ozb prefix", () => {
    const xml = `<rss xmlns:ozbargain="https://www.ozbargain.com.au"><channel><item>
      <title>Prefix variant</title><guid>prefix-1</guid>
      <ozbargain:meta expiry="2026-07-01T00:00:00+10:00" />
      <ozbargain:title-msg type="expired">expired</ozbargain:title-msg>
    </item></channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item.declaredExpiry).toBe("2026-07-01T00:00:00+10:00");
    expect(item.sourceMarkedExpired).toBe(true);
  });

  it("ignores markers with unknown or missing type attributes", () => {
    const xml = `<rss xmlns:ozb="https://www.ozbargain.com.au"><channel><item>
      <title>Odd markers</title><guid>odd-1</guid>
      <ozb:title-msg type="soldout">sold out</ozb:title-msg>
      <ozb:title-msg>expired</ozb:title-msg>
    </item></channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item.sourceMarkedExpired).toBe(false);
  });

  it("never surfaces the marker's free text, only the boolean", () => {
    const [outOfStock] = parseFeed(ozbExtensionXml);
    expect(JSON.stringify(outOfStock)).not.toContain("out of stock");
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

describe("mapFeedItem (source-state fields)", () => {
  it("normalises declared_expires_at to ISO and carries the expired marker", () => {
    const mapped = mapFeedItem(parseFeed(ozbExtensionXml)[0]);
    expect(mapped.declared_expires_at).toBe(
      new Date("2026-07-11T13:23:46+10:00").toISOString()
    );
    expect(mapped.source_marked_expired).toBe(true);
  });

  it("matches the legacy content hash for items without source state (no churn)", () => {
    // Re-derive the pre-source-state hash formula: rows already in the DB must
    // keep their hash so the next fetch does not rewrite the whole table.
    const mapped = mapFeedItem(parseFeed(sampleXml)[0]);
    const legacy = createHash("sha256")
      .update(
        [
          mapped.raw_title,
          mapped.raw_summary,
          mapped.link,
          mapped.categories.join("|"),
          mapped.posted_at ?? "",
        ].join("\u0001")
      )
      .digest("hex");
    expect(mapped.content_hash).toBe(legacy);
  });

  it("changes the content hash when the source flips to expired or the expiry is edited", () => {
    const vitamins = parseFeed(ozbExtensionXml)[1];
    const before = mapFeedItem(vitamins).content_hash;
    expect(
      mapFeedItem({ ...vitamins, sourceMarkedExpired: true }).content_hash
    ).not.toBe(before);
    expect(
      mapFeedItem({ ...vitamins, declaredExpiry: "2026-09-01T00:00:00+10:00" })
        .content_hash
    ).not.toBe(before);
  });

  it("returns to the base hash when a marker is withdrawn (un-expire re-stamps)", () => {
    const vitamins = parseFeed(ozbExtensionXml)[1];
    const base = mapFeedItem(vitamins).content_hash;
    const marked = mapFeedItem({ ...vitamins, sourceMarkedExpired: true });
    const withdrawn = mapFeedItem({ ...marked, ...vitamins });
    expect(marked.content_hash).not.toBe(base);
    expect(withdrawn.content_hash).toBe(base);
    expect(withdrawn.source_marked_expired).toBe(false);
  });

  it("rejects non-ISO declared expiry values instead of storing them", () => {
    const vitamins = parseFeed(ozbExtensionXml)[1];
    for (const bad of [
      "yesterday",
      "2026",
      "2026-07",
      "1234567890",
      "Wed, 10 Jun 2026 09:00:00 +1000",
      "2026-13-45T00:00:00+10:00",
    ]) {
      expect(
        mapFeedItem({ ...vitamins, declaredExpiry: bad }).declared_expires_at
      ).toBeNull();
    }
    // Date-only and offset/Z date-times are the accepted shapes.
    expect(
      mapFeedItem({ ...vitamins, declaredExpiry: "2026-08-01" })
        .declared_expires_at
    ).toBe(new Date("2026-08-01").toISOString());
    expect(
      mapFeedItem({ ...vitamins, declaredExpiry: "2026-08-01T10:00:00Z" })
        .declared_expires_at
    ).toBe("2026-08-01T10:00:00.000Z");
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
