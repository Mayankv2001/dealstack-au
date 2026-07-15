import { describe, expect, it } from "vitest";
import { mapGiftCardProduct } from "@/lib/repos/giftCardProducts";
import {
  formatDenominations,
  productFactRows,
  searchableProductText,
} from "@/lib/giftcards/productCatalogue";

const coreRow = {
  id: "tcn-shop",
  brand: "TCN Shop",
  slug: "tcn-shop",
  issuer: "The Card Network",
  card_network: "closed-loop",
  format: "unknown",
  variable_load: null,
  min_denomination: null,
  max_denomination: null,
  category_restricted: false,
  supported_mccs: [],
  unsupported_mccs: [],
  mobile_wallet: "unknown",
  redemption_notes: null,
};

describe("gift-card product catalogue boundary", () => {
  it("degrades every 028 field honestly when a pre-028 row has none", () => {
    const product = mapGiftCardProduct(coreRow);
    expect(product.aliases).toEqual([]);
    expect(product.officialProductPage).toBeNull();
    expect(product.onlineAvailable).toBeNull();
    expect(product.denominations).toBeNull();
    expect(product.splitPayment).toBe("unknown");
    expect(productFactRows(product)).toContainEqual({
      label: "Activation",
      value: "Not recorded",
    });
    expect(productFactRows(product)).toContainEqual({
      label: "Network",
      value: "closed loop",
    });
  });

  it("round-trips aliases and only accepts positive numeric denominations", () => {
    const product = mapGiftCardProduct({
      ...coreRow,
      aliases: [" TCN Shopping ", "TCN Shop", ""],
      denominations: [20, "50", 0, "not-a-number"],
      official_product_page: "https://example.com/tcn-shop",
      online_available: true,
      in_store_available: false,
      split_payment: "partial",
    });
    expect(product.aliases).toEqual(["TCN Shopping", "TCN Shop"]);
    expect(product.denominations).toEqual([20, 50]);
    expect(product.officialProductPage).toBe("https://example.com/tcn-shop");
    expect(product.splitPayment).toBe("partial");
    expect(searchableProductText(product)).toContain("tcn shopping");
  });

  it("renders fully-null logistics as not recorded, not unsupported", () => {
    const product = mapGiftCardProduct({ ...coreRow, card_network: "unknown" });
    expect(formatDenominations(product)).toBe("Not recorded");
    const facts = productFactRows(product);
    expect(facts.find((fact) => fact.label === "Online")?.value).toBe("Not recorded");
    expect(facts.find((fact) => fact.label === "Official product page")?.value).toBe("Not recorded");
    expect(facts.find((fact) => fact.label === "Network")?.value).toBe("Not recorded");
  });
});
