import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
  revalidatePath: vi.fn(),
  approveFeedItem: vi.fn(),
  rejectFeedItem: vi.fn(),
  setSignalStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({
  checkAdminRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/admin/repos/feedQueue", () => ({
  approveFeedItem: mocks.approveFeedItem,
  rejectFeedItem: mocks.rejectFeedItem,
  setFeedItemHomepageHidden: vi.fn(),
}));
vi.mock("@/lib/admin/repos/signals", () => ({
  setSignalStatus: mocks.setSignalStatus,
  CONFIDENCE_LEVELS: ["confirmed", "needs-verification", "expired-unknown"],
  DEAL_KINDS: ["discount-code", "cashback", "gift-card", "points", "guide", "card"],
  SENTIMENTS: ["positive", "neutral", "negative"],
  SIGNAL_STATUSES: ["pending", "approved", "hidden", "expired"],
  insertSignal: vi.fn(),
  updateSignal: vi.fn(),
}));

import {
  approveSelectedItems,
  rejectSelectedItems,
} from "@/app/admin/(protected)/signals/queue/actions";
import { approveSelectedSignals } from "@/app/admin/(protected)/signals/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@example.com" });
  mocks.checkRateLimit.mockResolvedValue({ success: true });
  mocks.approveFeedItem.mockResolvedValue({ signalId: "sig-x", created: true });
  mocks.rejectFeedItem.mockResolvedValue(undefined);
  mocks.setSignalStatus.mockResolvedValue(undefined);
});

describe("direct queue bulk moderation", () => {
  it("approves selected queue items directly and refreshes public routes", async () => {
    await expect(approveSelectedItems(["a", "b"])).resolves.toEqual({ ok: true });
    expect(mocks.approveFeedItem).toHaveBeenCalledTimes(2);
    expect(mocks.checkRateLimit).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/deals");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/search");
  });

  it("rejects selected items with reviewer identity and no public refresh", async () => {
    await expect(rejectSelectedItems(["a", "b"])).resolves.toEqual({ ok: true });
    expect(mocks.rejectFeedItem).toHaveBeenNthCalledWith(1, "a", "admin@example.com");
    expect(mocks.rejectFeedItem).toHaveBeenNthCalledWith(2, "b", "admin@example.com");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/deals");
  });

  it("dedupes, drops blanks and caps a batch at 200", async () => {
    const ids = ["", "same", "same", ...Array.from({ length: 250 }, (_, i) => `id-${i}`)];
    await approveSelectedItems(ids);
    expect(mocks.approveFeedItem).toHaveBeenCalledTimes(200);
  });

  it("continues after per-item failures and reports the partial result", async () => {
    mocks.approveFeedItem
      .mockResolvedValueOnce({ signalId: "s1", created: true })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ signalId: "s3", created: true });
    await expect(approveSelectedItems(["a", "b", "c"])).resolves.toEqual({
      error: expect.stringContaining("Approved 2 of 3"),
    });
    expect(mocks.approveFeedItem).toHaveBeenCalledTimes(3);
  });

  it("does no work when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      success: false,
      error: "Rate limit exceeded.",
    });
    await expect(approveSelectedItems(["a"])).resolves.toEqual({
      error: "Rate limit exceeded.",
    });
    expect(mocks.approveFeedItem).not.toHaveBeenCalled();
  });
});

describe("legacy/manual signal bulk approval", () => {
  it("still supports pending signals created manually outside the feed queue", async () => {
    await expect(approveSelectedSignals(["s1", "s2"])).resolves.toEqual({ ok: true });
    expect(mocks.setSignalStatus).toHaveBeenCalledTimes(2);
    expect(mocks.setSignalStatus).toHaveBeenCalledWith("s1", "approved");
  });
});
