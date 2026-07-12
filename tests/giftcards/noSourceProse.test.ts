import { describe, expect, it } from "vitest";
import { buildClaimSteps } from "@/lib/giftcards/claimSteps";
import { buildTermsRows } from "@/lib/giftcards/termsRows";
import { analyseGiftCardStackability } from "@/lib/giftcards/stackability";
import { buildProductAcceptance } from "@/lib/giftcards/acceptanceModel";
import type { GiftCardOffer } from "@/lib/offers/types";
import { makeOffer, NOW } from "./offerFixture";

/**
 * Guards the copyright boundary: the detail-page models must be built ONLY
 * from approved structured fields. Even if source prose somehow rides along
 * on the offer object (extra keys from a select("*")), the models must never
 * read it or leak it into any rendered string.
 */

const MARKER =
  "UNIQUE-SOURCE-PROSE-MARKER Card.Gift has slashed prices across its TCN range this week";

/** An offer carrying smuggled raw-source fields, with read tracking. */
function offerWithSmuggledProse(): { offer: GiftCardOffer; reads: string[] } {
  const target = {
    ...makeOffer(),
    // Simulated raw-source leakage a defensive mapper might pass through:
    excerpt: MARKER,
    raw_payload: { item: { excerpt: MARKER, body: MARKER } },
    articleBody: MARKER,
  } as GiftCardOffer;
  const reads: string[] = [];
  const offer = new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "string") reads.push(prop);
      return Reflect.get(obj, prop, receiver);
    },
  });
  return { offer, reads };
}

const FORBIDDEN_KEYS = ["excerpt", "raw_payload", "articleBody"];

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectStrings(v, out));
  }
  return out;
}

describe("no source prose reaches the detail models", () => {
  it("claim steps never read or emit raw source fields", () => {
    const { offer, reads } = offerWithSmuggledProse();
    const steps = buildClaimSteps(offer);
    expect(reads.filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
    expect(collectStrings(steps).join(" ")).not.toContain("UNIQUE-SOURCE-PROSE-MARKER");
  });

  it("terms rows never read or emit raw source fields", () => {
    const { offer, reads } = offerWithSmuggledProse();
    const rows = buildTermsRows(offer);
    expect(reads.filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
    expect(collectStrings(rows).join(" ")).not.toContain("UNIQUE-SOURCE-PROSE-MARKER");
  });

  it("stackability analysis never reads or emits raw source fields", () => {
    const { offer, reads } = offerWithSmuggledProse();
    const analysis = analyseGiftCardStackability(offer, { now: NOW });
    expect(reads.filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
    expect(collectStrings(analysis).join(" ")).not.toContain(
      "UNIQUE-SOURCE-PROSE-MARKER"
    );
  });

  it("acceptance views never read or emit raw source fields", () => {
    const { offer, reads } = offerWithSmuggledProse();
    const views = buildProductAcceptance(offer, [], []);
    expect(reads.filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
    expect(collectStrings(views).join(" ")).not.toContain(
      "UNIQUE-SOURCE-PROSE-MARKER"
    );
  });
});
