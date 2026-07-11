import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import { POST } from "@/app/api/card-offers/[id]/report/route";

function request(body: unknown, origin = "https://app.example") {
  return new NextRequest("https://app.example/api/card-offers/card-1/report", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => rpc.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("POST card correction report", () => {
  it("rejects cross-origin and malformed reports without DB work", async () => {
    expect((await POST(request({ reason: "fee", details: "The fee changed." }, "https://evil.example"), { params: Promise.resolve({ id: "card-1" }) })).status).toBe(403);
    expect((await POST(request({ reason: "fee", details: "short" }), { params: Promise.resolve({ id: "card-1" }) })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stages a private report without changing the offer", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    rpc.mockResolvedValue({ data: true, error: null });
    const response = await POST(request({ reason: "fee", details: "The issuer page now lists a different annual fee." }), { params: Promise.resolve({ id: "card-1" }) });
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("submit_card_offer_correction", expect.objectContaining({ p_card_offer_id: "card-1", p_reason: "fee" }));
  });

  it("returns 429 when the atomic database limiter is full", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(request({ reason: "bonus", details: "The displayed bonus does not match the issuer terms." }), { params: Promise.resolve({ id: "card-1" }) });
    expect(response.status).toBe(429);
  });
});

