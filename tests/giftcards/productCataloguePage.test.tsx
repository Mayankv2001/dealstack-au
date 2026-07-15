import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeGiftCardProduct } from "../stack/factories";

const mocks = vi.hoisted(() => ({
  products: vi.fn(),
  acceptance: vi.fn(),
}));

vi.mock("@/lib/repos", () => ({
  getAllGiftCardProducts: mocks.products,
  getAllGiftCardAcceptance: mocks.acceptance,
}));
vi.mock("@/components/SiteHeader", () => ({ default: () => <header /> }));
vi.mock("@/components/SiteFooter", () => ({ default: () => <footer /> }));
vi.mock("@/components/GiftCardsSubnav", () => ({ default: () => <nav /> }));

import GiftCardProductsPage from "@/app/gift-cards/products/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acceptance.mockResolvedValue([]);
});

describe("gift-card product directory", () => {
  it("renders pre-028 unknowns honestly instead of implying unsupported", async () => {
    mocks.products.mockResolvedValue([
      makeGiftCardProduct({
        brand: "Unspecified test card",
        issuer: null,
        cardNetwork: null,
        format: "unknown",
        mobileWallet: "unknown",
        denominations: null,
        minDenomination: null,
        maxDenomination: null,
      }),
    ]);
    const page = await GiftCardProductsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Issuer not recorded · Format not recorded");
    expect(html.match(/Not recorded/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain("unsupported");
  });

  it("matches a reviewed product alias in directory search", async () => {
    mocks.products.mockResolvedValue([
      makeGiftCardProduct({ brand: "TCN Shop", aliases: ["TCN Shopping"] }),
    ]);
    const page = await GiftCardProductsPage({
      searchParams: Promise.resolve({ q: "shopping" }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("TCN Shop");
    expect(html).toContain("TCN Shopping");
    expect(html).not.toContain("No products match");
  });
});
