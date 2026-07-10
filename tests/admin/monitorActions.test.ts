import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
  disableAllFeedSources: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({
  checkAdminRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/admin/repos/feedSources", () => ({
  disableAllFeedSources: mocks.disableAllFeedSources,
}));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: mocks.logAudit }));

import { disableAllFeeds } from "@/app/admin/(protected)/monitor/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@example.com" });
  mocks.checkRateLimit.mockResolvedValue({ success: true });
  mocks.disableAllFeedSources.mockResolvedValue(3);
  mocks.logAudit.mockResolvedValue(undefined);
});

describe("disableAllFeeds", () => {
  it("disables, audits, and revalidates every affected admin view", async () => {
    await expect(disableAllFeeds()).resolves.toEqual({ ok: true });

    expect(mocks.disableAllFeedSources).toHaveBeenCalledOnce();
    expect(mocks.logAudit).toHaveBeenCalledWith({
      actorEmail: "admin@example.com",
      action: "monitor-disable-all-feeds",
      tableName: "feed_sources",
      rowId: null,
      diff: { disabledCount: 3 },
    });
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin/monitor",
      "/admin/signals/sources",
      "/admin/dashboard",
    ]);
  });

  it("audits a no-op click too", async () => {
    mocks.disableAllFeedSources.mockResolvedValueOnce(0);

    await expect(disableAllFeeds()).resolves.toEqual({ ok: true });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ diff: { disabledCount: 0 } })
    );
  });

  it("does not mutate or audit when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      success: false,
      error: "Rate limited",
    });

    await expect(disableAllFeeds()).resolves.toEqual({ error: "Rate limited" });
    expect(mocks.disableAllFeedSources).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
