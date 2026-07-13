import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicaliseUrl,
  MAX_EXCERPT_LENGTH,
  parseAuDate,
  parseAuDateRange,
  parseGcdbFeed,
} from "@/lib/giftcards/parseGcdbFeed";

/**
 * Pure, offline parser tests. The feed shape mirrors GCDB's WordPress RSS 2.0:
 * structured <offer_type>/<offer_store>/<offer_gc> tags plus an "Ends …" date
 * in the description. The parser must keep ONLY structured facts and a bounded
 * excerpt — never article bodies, images or comments.
 */

function feed(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Gift Card Database</title>
    ${items}
  </channel>
</rss>`;
}

const DISCOUNT_ITEM = `
  <item>
    <title>10% off Coles Group &amp; Myer gift cards</title>
    <link>https://gcdb.com.au/offer/12870/</link>
    <guid isPermaLink="false">https://gcdb.com.au/?post_type=offer&amp;p=12870</guid>
    <pubDate>Fri, 10 Jul 2026 00:00:00 +0000</pubDate>
    <description>&lt;p&gt;Get 10% off selected cards. Ends 17 Jul 2026. See Gift Card Database for more info.&lt;/p&gt;</description>
    <offer_type>Discount</offer_type>
    <offer_store>Coles</offer_store>
    <offer_gc>TCN Love</offer_gc>
    <offer_gc>TCN Shop</offer_gc>
  </item>`;

describe("parseGcdbFeed — a structured discount item", () => {
  const [item] = parseGcdbFeed(feed(DISCOUNT_ITEM));

  it("extracts the WordPress post id from the guid as the external id", () => {
    expect(item.externalId).toBe("12870");
  });

  it("canonicalises the link and lower-cases the offer type", () => {
    expect(item.canonicalUrl).toBe("https://gcdb.com.au/offer/12870/");
    expect(item.offerType).toBe("discount");
  });

  it("keeps the seller and de-duplicated brand list", () => {
    expect(item.sellerName).toBe("Coles");
    expect(item.giftCardBrands).toEqual(["TCN Love", "TCN Shop"]);
  });

  it("parses the AU 'Ends' date to ISO YYYY-MM-DD", () => {
    expect(item.endsAt).toBe("2026-07-17");
    expect(item.startsAt).toBeNull();
  });

  it("decodes entities in the title and strips the boilerplate tail from the excerpt", () => {
    expect(item.title).toBe("10% off Coles Group & Myer gift cards");
    expect(item.excerpt).toBe("Get 10% off selected cards. Ends 17 Jul 2026.");
    expect(item.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH);
  });

  it("parses pubDate to an ISO timestamp", () => {
    expect(item.publishedAt).toBe("2026-07-10T00:00:00.000Z");
  });
});

describe("parseGcdbFeed — defensive behaviour", () => {
  it("returns [] for empty or whitespace input", () => {
    expect(parseGcdbFeed("")).toEqual([]);
    expect(parseGcdbFeed("   ")).toEqual([]);
  });

  it("returns [] for malformed / non-RSS XML", () => {
    expect(parseGcdbFeed("<not-rss><nope/></not-rss>")).toEqual([]);
    expect(parseGcdbFeed("<<<broken")).toEqual([]);
  });

  it("drops items missing a title or link", () => {
    const noLink = `<item><title>No link here</title></item>`;
    const noTitle = `<item><link>https://gcdb.com.au/offer/9/</link></item>`;
    expect(parseGcdbFeed(feed(noLink + noTitle))).toEqual([]);
  });

  it("bounds the excerpt to MAX_EXCERPT_LENGTH", () => {
    const long = "x".repeat(500);
    const item = `<item><title>Long</title><link>https://gcdb.com.au/offer/5/</link>
      <guid>https://gcdb.com.au/?p=5</guid><description>${long}</description></item>`;
    const [parsed] = parseGcdbFeed(feed(item));
    expect(parsed.excerpt.length).toBe(MAX_EXCERPT_LENGTH);
  });
});

describe("canonicaliseUrl", () => {
  it("forces https, lower-cases the host and strips query/hash", () => {
    expect(canonicaliseUrl("http://GCDB.com.au/offer/1/?utm=x#frag")).toBe(
      "https://gcdb.com.au/offer/1/"
    );
  });

  it("returns the trimmed input for an unparseable URL", () => {
    expect(canonicaliseUrl("  not a url  ")).toBe("not a url");
  });
});

describe("parseAuDate", () => {
  it("parses short and long AU month spellings", () => {
    expect(parseAuDate("17 Jul 2026")).toBe("2026-07-17");
    expect(parseAuDate("1 September 2026")).toBe("2026-09-01");
  });

  it("returns null for nonsense or missing dates", () => {
    expect(parseAuDate("sometime soon")).toBeNull();
    expect(parseAuDate(null)).toBeNull();
    expect(parseAuDate("32 Xxx 2026")).toBeNull();
  });
});

describe("GCDB production date markers", () => {
  it("parses the compact supermarket range that caused the missing-expiry rows", () => {
    const rangeItem = `<item><title>10% off selected cards</title>
      <link>https://gcdb.com.au/offer/12676/</link>
      <guid>https://gcdb.com.au/?p=12676</guid>
      <description>8 Jul to 14 Jul 2026</description>
      <offer_type>Discount</offer_type><offer_store>Coles</offer_store>
      <offer_gc>Restaurant Choice</offer_gc></item>`;
    const [parsed] = parseGcdbFeed(feed(rangeItem));
    expect(parsed.startsAt).toBe("2026-07-08");
    expect(parsed.endsAt).toBe("2026-07-14");
    expect(parsed.sourceMarkedExpired).toBe(false);
  });

  it("parses an Expired marker instead of treating it as missing expiry", () => {
    const expiredItem = `<item><title>10% off selected cards</title>
      <link>https://gcdb.com.au/offer/12716/</link>
      <guid>https://gcdb.com.au/?p=12716</guid>
      <description>Expired 9 Jul 2026</description></item>`;
    const [parsed] = parseGcdbFeed(feed(expiredItem));
    expect(parsed.endsAt).toBe("2026-07-09");
    expect(parsed.sourceMarkedExpired).toBe(true);
    expect(parsed.isOngoing).toBe(false);
  });

  it("only marks ongoing when the source explicitly says so", () => {
    const ongoingItem = `<item><title>Member catalogue</title>
      <link>https://gcdb.com.au/offer/4897/</link>
      <guid>https://gcdb.com.au/?p=4897</guid>
      <description>Ongoing offer</description></item>`;
    expect(parseGcdbFeed(feed(ongoingItem))[0].isOngoing).toBe(true);
  });

  it("parses an inferred-year AU range directly", () => {
    expect(parseAuDateRange("9 Jul to 15 Jul 2026")).toEqual({
      startsAt: "2026-07-09",
      endsAt: "2026-07-15",
    });
  });
});

describe("sanitised real GCDB feed fixture", () => {
  const xml = readFileSync(
    new URL(
      "../fixtures/giftcards/gcdb-feed-2026-07-13-sanitised.xml",
      import.meta.url
    ),
    "utf8"
  );
  const items = parseGcdbFeed(xml);

  it("preserves the real repeated-tag feed shape without source prose", () => {
    expect(items).toHaveLength(6);
    expect(items.find((item) => item.externalId === "12680")).toMatchObject({
      sellerName: "Amazon",
      endsAt: "2026-07-13",
    });
    expect(
      items.find((item) => item.externalId === "12680")?.giftCardBrands.length
    ).toBeGreaterThan(30);
  });

  it("parses the future supermarket date ranges from the real shape", () => {
    expect(items.find((item) => item.externalId === "12845")).toMatchObject({
      startsAt: "2026-07-15",
      endsAt: "2026-07-21",
    });
    expect(items.find((item) => item.externalId === "12844")).toMatchObject({
      startsAt: "2026-07-15",
      endsAt: "2026-07-21",
    });
  });
});
