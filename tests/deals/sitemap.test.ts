import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TASK-SEO-002 — the sitemap must advertise the live public detail-route
 * families (gift-card offers, card offers) and the newly-added static routes,
 * carry a truthful `lastModified` only where a real timestamp exists, and never
 * advertise an offer the repository loader filtered out (expired/unpublished).
 * The loaders are mocked so the expiry/publication boundary is represented by
 * "what the loader returns" — exactly the contract the sitemap relies on.
 */

const repos = vi.hoisted(() => ({
  getStores: vi.fn(),
  getAllGiftCardProducts: vi.fn(),
  getCurrentReviewedGiftCardOffers: vi.fn(),
  getCardOffers: vi.fn(),
  getWeeklyDeals: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ siteUrl: () => "https://dealstack.test" }));
vi.mock("@/lib/repos", () => ({
  getStores: repos.getStores,
  getAllGiftCardProducts: repos.getAllGiftCardProducts,
  getCurrentReviewedGiftCardOffers: repos.getCurrentReviewedGiftCardOffers,
  getCardOffers: repos.getCardOffers,
}));
vi.mock("@/lib/repos/weeklyDeals", () => ({
  getWeeklyDeals: repos.getWeeklyDeals,
}));
vi.mock("@/lib/rewards/programmes", () => ({
  REWARDS_PROGRAMMES: [{ slug: "flybuys", name: "Flybuys", shortName: "FB" }],
}));

import sitemap from "@/app/sitemap";

const BASE = "https://dealstack.test";

beforeEach(() => {
  vi.clearAllMocks();
  repos.getStores.mockResolvedValue([{ id: "myer", name: "Myer" }]);
  repos.getAllGiftCardProducts.mockResolvedValue([{ slug: "apple" }]);
  repos.getWeeklyDeals.mockResolvedValue([]);
  // The loader is expiry-filtered: gc-expired is simply never returned.
  repos.getCurrentReviewedGiftCardOffers.mockResolvedValue([
    { id: "gc-1", lastCheckedAt: "2026-07-20" },
    { id: "gc-nodate", lastCheckedAt: null },
  ]);
  repos.getCardOffers.mockResolvedValue([
    { id: "card-1", lastCheckedAt: "2026-07-18" },
  ]);
});

describe("sitemap", () => {
  const urls = async () => (await sitemap()).map((entry) => entry.url);

  it("advertises live gift-card offer detail routes with a truthful lastModified", async () => {
    const entries = await sitemap();
    const gc1 = entries.find((e) => e.url === `${BASE}/gift-cards/gc-1`);
    expect(gc1).toBeDefined();
    expect(gc1?.lastModified).toEqual(new Date("2026-07-20"));
  });

  it("advertises live card offer detail routes", async () => {
    const entries = await sitemap();
    const card = entries.find((e) => e.url === `${BASE}/cards/card-1`);
    expect(card).toBeDefined();
    expect(card?.lastModified).toEqual(new Date("2026-07-18"));
  });

  it("omits lastModified when the offer has no truthful timestamp", async () => {
    const entries = await sitemap();
    const noDate = entries.find((e) => e.url === `${BASE}/gift-cards/gc-nodate`);
    expect(noDate).toBeDefined();
    expect(noDate?.lastModified).toBeUndefined();
  });

  it("includes the newly-added static detail-family routes", async () => {
    const list = await urls();
    expect(list).toContain(`${BASE}/cards/compare`);
    expect(list).toContain(`${BASE}/gift-cards/weekly/plan`);
  });

  it("never advertises an offer the loader filtered out (expired/unpublished)", async () => {
    const list = await urls();
    expect(list).not.toContain(`${BASE}/gift-cards/gc-expired`);
  });

  it("still covers the core static and store routes", async () => {
    const list = await urls();
    expect(list).toContain(`${BASE}/`);
    expect(list).toContain(`${BASE}/gift-cards`);
    expect(list).toContain(`${BASE}/stores/myer`);
    expect(list).toContain(`${BASE}/rewards/flybuys`);
  });
});
