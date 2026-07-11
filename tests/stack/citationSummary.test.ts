import { describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_SOURCES,
  providerSummaryLabel,
  summariseCitations,
} from "@/lib/stack/citationSummary";
import type { Citation } from "@/lib/sources/types";

describe("summariseCitations", () => {
  it("collapses many OzBargain citations to a single visible source", () => {
    const citations: Citation[] = [
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900001" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900002" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900003" },
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ];
    const summary = summariseCitations(citations);
    // One badge per distinct provider, not per record.
    const ozb = summary.providers.filter((p) => p.source === "ozbargain");
    expect(ozb).toHaveLength(1);
    expect(ozb[0].count).toBe(3);
    expect(summary.providers).toHaveLength(2);
  });

  it("dedupes identical source + URL pairs (URL normalised)", () => {
    const citations: Citation[] = [
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900001" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900001/" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/900001?ref=x" },
    ];
    const summary = summariseCitations(citations);
    expect(summary.total).toBe(1);
    expect(summary.all).toHaveLength(1);
  });

  it("reports an accurate total distinct-source count", () => {
    const citations: Citation[] = [
      { source: "manual", sourceUrl: "/" },
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/1" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/2" },
    ];
    const summary = summariseCitations(citations);
    expect(summary.total).toBe(4);
  });

  it("never exposes more than the visible limit of source badges", () => {
    const citations: Citation[] = [
      { source: "manual", sourceUrl: "/" },
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/1" },
      { source: "pointhacks", sourceUrl: "https://www.pointhacks.com.au" },
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ];
    const summary = summariseCitations(citations);
    expect(summary.visibleProviders.length).toBeLessThanOrEqual(MAX_VISIBLE_SOURCES);
    expect(summary.hiddenProviderCount).toBe(
      summary.providers.length - summary.visibleProviders.length
    );
    // Strongest trust first — "manual" (DealStack, weight 1) leads.
    expect(summary.visibleProviders[0].source).toBe("manual");
  });

  it("keeps the full citation list for the accessible disclosure", () => {
    const citations: Citation[] = [
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/1" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/2" },
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ];
    const summary = summariseCitations(citations);
    // Traceability preserved: every distinct source is still listed.
    expect(summary.all).toHaveLength(3);
  });

  it("builds a compact provider label with a +N overflow", () => {
    const citations: Citation[] = [
      { source: "manual", sourceUrl: "/" },
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/node/1" },
      { source: "pointhacks", sourceUrl: "https://www.pointhacks.com.au" },
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ];
    const label = providerSummaryLabel(summariseCitations(citations));
    expect(label).toMatch(/\+2$/);
    expect(label.startsWith("DealStack verified")).toBe(true);
  });

  it("returns an empty summary when there are no citations", () => {
    const summary = summariseCitations([]);
    expect(summary.total).toBe(0);
    expect(summary.providers).toHaveLength(0);
  });
});
