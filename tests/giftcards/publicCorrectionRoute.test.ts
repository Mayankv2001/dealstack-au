import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import { POST } from "@/app/api/reports/[entityType]/[id]/route";

function request(body: unknown, origin = "https://app.example") {
  return new NextRequest("https://app.example/api/reports/gift-card-offer/offer-1", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
}

beforeEach(() => rpc.mockReset());

describe("POST public gift-card correction", () => {
  it("rejects cross-origin and malformed input before database work", async () => {
    expect((await POST(request({ reason: "expiry", details: "The expiry changed." }, "https://evil.example"), { params: Promise.resolve({ entityType: "gift-card-offer", id: "offer-1" }) })).status).toBe(403);
    expect((await POST(request({ reason: "expiry", details: "short" }), { params: Promise.resolve({ entityType: "gift-card-offer", id: "offer-1" }) })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("submits a private reviewed-fact report without mutating the offer", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const response = await POST(request({ reason: "expiry", details: "The source now shows a different expiry date." }), { params: Promise.resolve({ entityType: "gift-card-offer", id: "offer-1" }) });
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("submit_public_correction", expect.objectContaining({ p_entity_type: "gift-card-offer", p_entity_id: "offer-1", p_reason: "expiry" }));
  });

  it("enforces the database rate limit", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(request({ reason: "terms", details: "The source lists different purchase restrictions." }), { params: Promise.resolve({ entityType: "gift-card-product", id: "product-1" }) });
    expect(response.status).toBe(429);
  });
});
