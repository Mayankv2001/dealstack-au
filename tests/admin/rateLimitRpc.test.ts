import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import { checkAdminRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/admin/rate-limit";

beforeEach(() => rpc.mockReset());

describe("production rate-limit RPC path", () => {
  it("uses the atomic consume function when no test store is injected", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(checkAdminRateLimit({ adminEmail: "ADMIN@example.com" })).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("consume_admin_rate_limit", {
      p_admin_email: "admin@example.com",
      p_action_key: "admin_mutation",
      p_max: 30,
      p_window_seconds: 60,
    });
  });

  it("returns the typed throttle error when the function refuses consumption", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(checkAdminRateLimit({ adminEmail: "a@example.com" })).resolves.toEqual({
      success: false,
      error: RATE_LIMIT_MESSAGE,
      retryAfterSeconds: 60,
    });
  });
});

