import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GiftCardOfferCard from "@/components/GiftCardOfferCard";
import { makeOffer, NOW } from "./offerFixture";

describe("GiftCardOfferCard public labels", () => {
  it("renders seller, publisher, brand and redemption destination as separate facts", () => {
    const html = renderToStaticMarkup(
      <GiftCardOfferCard
        offer={makeOffer({
          brand: "Apple",
          purchaseLocation: "Woolworths",
          source: "Woolworths",
          sourceName: "Gift Card Database",
          acceptedAt: ["Apple Store"],
        })}
        now={NOW}
      />,
    );

    expect(html).toContain("Buy from");
    expect(html).toContain("Woolworths");
    expect(html).toContain("Offer source");
    expect(html).toContain("Gift Card Database");
    expect(html).toContain("Card brand");
    expect(html).toContain("Apple");
    expect(html).toContain("Redeem at");
    expect(html).toContain("Apple Store");
    expect(html).not.toContain(" via ");
  });

  it("renders an unknown date honestly instead of implying an ongoing offer", () => {
    const html = renderToStaticMarkup(
      <GiftCardOfferCard
        offer={makeOffer({
          expiryDate: null,
          startDate: null,
          isOngoing: false,
        })}
        now={NOW}
      />,
    );

    expect(html).toContain("Date unknown");
    expect(html).not.toContain("Ongoing");
  });
});
