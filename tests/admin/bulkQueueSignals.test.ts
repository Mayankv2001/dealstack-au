import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bulk feed-queue import and bulk signal approval.
 *
 * Both actions: gate on requireAdmin() + one rate-limit unit for the whole
 * batch, dedupe/cap the id list, apply the SAME per-item write as their
 * single-item siblings, keep going when one item throws, and write a single
 * summary audit row. Bulk import never publishes (importFeedItem lands a
 * pending signal); bulk approve is the manual review step.
 */

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  importFeedItem: vi.fn(),
  setSignalStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({
  checkAdminRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/admin/repos/feedQueue", () => ({
  importFeedItem: mocks.importFeedItem,
  setFeedItemReviewState: vi.fn(),
  setFeedItemHomepageHidden: vi.fn(),
}));
vi.mock("@/lib/admin/repos/signals", () => ({
  setSignalStatus: mocks.setSignalStatus,
  // Constants referenced at module load by signals/actions.ts.
  CONFIDENCE_LEVELS: ["confirmed", "needs-verification", "expired-unknown"],
  DEAL_KINDS: ["discount-code", "cashback", "gift-card", "points", "guide", "card"],
  SENTIMENTS: ["positive", "neutral", "negative"],
  SIGNAL_STATUSES: ["pending", "approved", "hidden", "expired"],
  insertSignal: vi.fn(),
  setSignalStatus_UNUSED: vi.fn(),
  updateSignal: vi.fn(),
}));

import { importSelectedItems } from "@/app/admin/(protected)/signals/queue/actions";
import { approveSelectedSignals } from "@/app/admin/(protected)/signals/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@example.com" });
  mocks.checkRateLimit.mockResolvedValue({ success: true });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.importFeedItem.mockResolvedValue({ signalId: "sig-x", created: true });
  mocks.setSignalStatus.mockResolvedValue(undefined);
});

describe("importSelectedItems (bulk feed-queue import)", () => {
  it("imports each selected id as a pending signal and audits one summary row", async () => {
    mocks.importFeedItem
      .mockResolvedValueOnce({ signalId: "s1", created: true })
      .mockResolvedValueOnce({ signalId: "s2", created: false });

    await expect(importSelectedItems(["a", "b"])).resolves.toEqual({ ok: true });

    expect(mocks.importFeedItem).toHaveBeenCalledTimes(2);
    expect(mocks.checkRateLimit).toHaveBeenCalledOnce(); // one unit for the batch
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: "admin@example.com",
        action: "import",
        tableName: "feed_items",
        rowId: null,
        diff: expect.objectContaining({
          bulk: true,
          count: 2,
          created: 1,
          linked: 1,
          failedCount: 0,
        }),
      })
    );
  });

  it("dedupes and drops blank ids before importing", async () => {
    await importSelectedItems(["a", "a", "", "b"]);
    expect(mocks.importFeedItem).toHaveBeenCalledTimes(2);
  });

  it("keeps going when one item throws, and reports the failure count", async () => {
    mocks.importFeedItem
      .mockResolvedValueOnce({ signalId: "s1", created: true })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ signalId: "s3", created: true });

    const result = await importSelectedItems(["a", "b", "c"]);
    expect(mocks.importFeedItem).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      error: expect.stringContaining("2 of 3"),
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        diff: expect.objectContaining({ failedCount: 1 }),
      })
    );
  });

  it("does nothing on an empty selection", async () => {
    await expect(importSelectedItems([])).resolves.toEqual({ ok: true });
    expect(mocks.importFeedItem).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("does not import or audit when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      success: false,
      error: "Rate limit exceeded.",
    });
    await expect(importSelectedItems(["a"])).resolves.toEqual({
      error: "Rate limit exceeded.",
    });
    expect(mocks.importFeedItem).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("caps the batch at 200 items", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    await importSelectedItems(ids);
    expect(mocks.importFeedItem).toHaveBeenCalledTimes(200);
  });
});

describe("approveSelectedSignals (bulk approve)", () => {
  it("approves each selected id and audits one summary row", async () => {
    await expect(approveSelectedSignals(["s1", "s2"])).resolves.toEqual({
      ok: true,
    });
    expect(mocks.setSignalStatus).toHaveBeenCalledTimes(2);
    expect(mocks.setSignalStatus).toHaveBeenCalledWith("s1", "approved");
    expect(mocks.checkRateLimit).toHaveBeenCalledOnce();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "status",
        tableName: "ozbargain_signals",
        rowId: null,
        diff: expect.objectContaining({
          bulk: true,
          status: "approved",
          count: 2,
          approved: 2,
          failedCount: 0,
        }),
      })
    );
  });

  it("keeps going when one approval throws, and reports the failure count", async () => {
    mocks.setSignalStatus
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"));
    const result = await approveSelectedSignals(["s1", "s2"]);
    expect(result).toEqual({ error: expect.stringContaining("1 of 2") });
  });

  it("does not approve or audit when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      success: false,
      error: "Rate limit exceeded.",
    });
    await expect(approveSelectedSignals(["s1"])).resolves.toEqual({
      error: "Rate limit exceeded.",
    });
    expect(mocks.setSignalStatus).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("caps the batch at 200 items", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `s-${i}`);
    await approveSelectedSignals(ids);
    expect(mocks.setSignalStatus).toHaveBeenCalledTimes(200);
  });
});
