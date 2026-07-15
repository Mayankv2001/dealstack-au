import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRate: vi.fn(),
  audit: vi.fn(),
  insertProduct: vi.fn(),
  updateProduct: vi.fn(),
  getEvidence: vi.fn(),
  catalogueAvailable: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({ checkAdminRateLimit: mocks.checkRate }));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/admin/repos/giftCardIntelligence", () => ({
  getGiftCardProductSourceEvidence: mocks.getEvidence,
  insertGiftCardProduct: mocks.insertProduct,
  isProductCatalogueSchemaAvailable: mocks.catalogueAvailable,
  updateGiftCardProduct: mocks.updateProduct,
}));

import {
  createGiftCardProduct,
  updateGiftCardProductAction,
} from "@/app/admin/(protected)/gift-card-intelligence/actions";

function coreProductForm(): FormData {
  const form = new FormData();
  form.set("id", "tcn-shop");
  form.set("slug", "tcn-shop");
  form.set("brand", "TCN Shop");
  form.set("source_url", "https://example.test/products/tcn-shop");
  form.set("card_network", "unknown");
  form.set("format", "unknown");
  form.set("variable_load", "unknown");
  form.set("mobile_wallet", "unknown");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@dealstack.test" });
  mocks.checkRate.mockResolvedValue({ success: true });
  mocks.audit.mockResolvedValue(undefined);
  mocks.insertProduct.mockResolvedValue(undefined);
  mocks.updateProduct.mockResolvedValue(undefined);
  mocks.getEvidence.mockResolvedValue([]);
  mocks.catalogueAvailable.mockResolvedValue(true);
});

describe("gift-card product catalogue admin actions", () => {
  it("creates an inactive product with field-level evidence and an explicit audit", async () => {
    const form = coreProductForm();
    form.set("card_network", "closed-loop");
    form.set("variable_load", "yes");
    form.set("aliases", "TCN Shopping, TCN Shop Card");
    form.set("official_product_page", "https://example.test/products/tcn-shop");
    form.set("category_restricted", "on");

    await expect(createGiftCardProduct({}, form)).resolves.toEqual({
      success: "Product saved inactive for final publication review.",
    });

    const inserted = mocks.insertProduct.mock.calls[0][0];
    expect(inserted).toMatchObject({
      id: "tcn-shop",
      aliases: ["TCN Shopping", "TCN Shop Card"],
      card_network: "closed-loop",
      variable_load: true,
      category_restricted: true,
      is_active: false,
    });
    expect(inserted).not.toHaveProperty("evidenceFields");
    expect(inserted.source_evidence[0].fields).toEqual(
      expect.arrayContaining([
        "id",
        "brand",
        "slug",
        "card_network",
        "variable_load",
        "category_restricted",
        "aliases",
        "official_product_page",
      ]),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        tableName: "gift_card_products",
        rowId: "tcn-shop",
        forceExplicit: true,
      }),
    );
  });

  it.each([
    ["card_network", "amex", /valid card network/i],
    ["variable_load", "sometimes", /valid variable-load/i],
  ])("rejects an invalid %s without coercing it into a product fact", async (field, value, message) => {
    const form = coreProductForm();
    form.set(field, value);
    await expect(createGiftCardProduct({}, form)).resolves.toEqual({
      error: expect.stringMatching(message),
    });
    expect(mocks.insertProduct).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("updates catalogue fields with new evidence and an explicit audit", async () => {
    mocks.getEvidence.mockResolvedValue([
      {
        url: "https://example.test/original",
        checkedAt: "2026-07-14T00:00:00.000Z",
        status: "reviewed",
        fields: ["brand"],
      },
    ]);
    const form = new FormData();
    form.set("source_url", "https://example.test/products/tcn-shop");
    form.set("aliases", "TCN Shopping, TCN Shop Card");
    form.set("denominations", "20, 50, 100");
    form.set("split_payment", "partial");

    await expect(updateGiftCardProductAction("tcn-shop", {}, form)).resolves.toEqual({
      success: "Product catalogue facts updated and rechecked.",
    });
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      "tcn-shop",
      expect.objectContaining({
        aliases: ["TCN Shopping", "TCN Shop Card"],
        denominations: [20, 50, 100],
        split_payment: "partial",
        source_evidence: expect.arrayContaining([
          expect.objectContaining({ fields: ["aliases", "denominations", "split_payment"] }),
        ]),
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        tableName: "gift_card_products",
        rowId: "tcn-shop",
        forceExplicit: true,
      }),
    );
  });

  it("degrades safely before migration 028 when no catalogue-only facts are supplied", async () => {
    mocks.catalogueAvailable.mockResolvedValue(false);
    await expect(createGiftCardProduct({}, coreProductForm())).resolves.toEqual({
      success: "Product saved inactive for final publication review.",
    });
    expect(mocks.catalogueAvailable).not.toHaveBeenCalled();
    const inserted = mocks.insertProduct.mock.calls[0][0];
    expect(inserted).not.toHaveProperty("aliases");
    expect(inserted).not.toHaveProperty("denominations");
    expect(inserted).not.toHaveProperty("split_payment");
  });
});
