import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cronSecret: vi.fn(),
  enabled: vi.fn(),
  lastStart: vi.fn(),
  startRun: vi.fn(),
  apply: vi.fn(),
  finish: vi.fn(),
  fail: vi.fn(),
  schemaUnavailable: vi.fn(),
  report: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/env", () => ({
  cronSecret: mocks.cronSecret,
  giftCardLifecycleEnabled: mocks.enabled,
}));
vi.mock("@/lib/admin/repos/giftCardLifecycle", () => ({
  lastSuccessfulLifecycleRunStart: mocks.lastStart,
  startLifecycleRun: mocks.startRun,
  applyGiftCardLifecycle: mocks.apply,
  finishLifecycleRun: mocks.finish,
  failLifecycleRun: mocks.fail,
  isGiftCardLifecycleSchemaUnavailable: mocks.schemaUnavailable,
}));
vi.mock("@/lib/observability/report-server-error", () => ({
  reportOperationalError: mocks.report,
}));

import { GET } from "@/app/api/cron/gift-card-lifecycle/route";

const SECRET = "lifecycle-secret";
const RUN_SLOT = new Date("2026-07-14T21:07:00Z"); // 07:07 Sydney, 15 July

function request(token = SECRET, force = false): Request {
  return new Request(
    `https://dealstack.test/api/cron/gift-card-lifecycle${force ? "?force=1" : ""}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
}

const success = {
  sydneyDate: "2026-07-15",
  activatedOfferIds: ["future-offer"],
  archivedOfferIds: ["expired-offer"],
  historySealedOfferIds: ["expired-offer"],
  affectedStoreIds: ["jb-hifi"],
  errors: [],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(RUN_SLOT);
  vi.clearAllMocks();
  mocks.cronSecret.mockReturnValue(SECRET);
  mocks.enabled.mockReturnValue(true);
  mocks.lastStart.mockResolvedValue(null);
  mocks.startRun.mockResolvedValue({ started: true, runId: "run-1" });
  mocks.apply.mockResolvedValue(success);
  mocks.finish.mockResolvedValue(undefined);
  mocks.fail.mockResolvedValue(undefined);
  mocks.schemaUnavailable.mockReturnValue(false);
  mocks.report.mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe("gift-card lifecycle route", () => {
  it("fails closed on missing/wrong authentication before DB access", async () => {
    mocks.cronSecret.mockReturnValue(null);
    expect((await GET(request())).status).toBe(503);
    expect(mocks.lastStart).not.toHaveBeenCalled();

    mocks.cronSecret.mockReturnValue(SECRET);
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.lastStart).not.toHaveBeenCalled();
  });

  it("does no DB work when the default-off environment gate is closed", async () => {
    mocks.enabled.mockReturnValue(false);
    const response = await GET(request(SECRET, true));
    expect(await response.json()).toMatchObject({
      ran: false,
      skipped: "environment-disabled",
    });
    expect(mocks.lastStart).not.toHaveBeenCalled();
  });

  it("rejects the off-hour UTC slot and accepts the DST-correct slot", async () => {
    vi.setSystemTime(new Date("2026-07-14T20:07:00Z"));
    const skipped = await GET(request());
    expect(await skipped.json()).toMatchObject({
      ran: false,
      skipped: "outside-run-hour",
      sydneyDate: "2026-07-15",
    });
    expect(mocks.startRun).not.toHaveBeenCalled();
  });

  it("force bypasses only the run hour, never a same-local-day success", async () => {
    vi.setSystemTime(new Date("2026-07-15T02:00:00Z"));
    mocks.lastStart.mockResolvedValue(new Date("2026-07-14T21:07:00Z"));
    const response = await GET(request(SECRET, true));
    expect(await response.json()).toMatchObject({
      ran: false,
      skipped: "already-ran-local-day",
    });
    expect(mocks.startRun).not.toHaveBeenCalled();
  });

  it("returns a controlled skip under global lock contention", async () => {
    mocks.startRun.mockResolvedValue({ started: false, reason: "already-running" });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      ran: false,
      skipped: "already-running",
    });
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("applies, finalises and revalidates every public/affected-store path", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      ran: true,
      runId: "run-1",
      runKind: "activate-archive",
      status: "ok",
      sydneyDate: "2026-07-15",
      activated: 1,
      archived: 1,
      historySealed: 1,
      errorCount: 0,
    });
    expect(mocks.finish).toHaveBeenCalledWith("run-1", success, expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gift-cards");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gift-cards/where-to-use");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/gift-cards/where-to-buy");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/search");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gift-cards/[id]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gift-cards/products/[slug]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/stores/[slug]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/rewards/[slug]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/stores/jb-hifi");
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("runs the fixed-clock activation once and performs no writes on the second local-day call", async () => {
    const first = await GET(request());
    expect((await first.json()).activated).toBe(1);
    mocks.lastStart.mockResolvedValue(RUN_SLOT);

    const second = await GET(request(SECRET, true));
    expect(await second.json()).toMatchObject({
      ran: false,
      skipped: "already-ran-local-day",
    });
    expect(mocks.startRun).toHaveBeenCalledOnce();
    expect(mocks.apply).toHaveBeenCalledOnce();
    expect(mocks.finish).toHaveBeenCalledOnce();
  });

  it("reports per-offer isolation as a structured partial run", async () => {
    mocks.apply.mockResolvedValue({
      ...success,
      errors: [{ offerId: "bad-row", step: "archive", error: "invalid history" }],
    });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      ran: true,
      status: "partial",
      errorCount: 1,
    });
    expect(mocks.finish).toHaveBeenCalledOnce();
    expect(mocks.report).toHaveBeenCalledOnce();
  });

  it("returns controlled 503 when migrations/RPC are unavailable", async () => {
    const error = new Error("schema unavailable");
    mocks.lastStart.mockRejectedValue(error);
    mocks.schemaUnavailable.mockImplementation((value) => value === error);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ran: false,
      skipped: "schema-unavailable",
    });
    expect(mocks.startRun).not.toHaveBeenCalled();
  });

  it("finalises an acquired run on retryable failure", async () => {
    mocks.apply.mockRejectedValue(new Error("transient"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(mocks.fail).toHaveBeenCalledWith("run-1", "transient", expect.any(Date));
    expect(mocks.finish).not.toHaveBeenCalled();
  });
});
