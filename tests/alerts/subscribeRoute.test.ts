import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requestEmailAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/alerts/repo", () => ({ requestEmailAlert }));
vi.mock("@/lib/env", () => ({ emailAlertTokenSecret: () => "test-token-secret", emailAlertsPublicEnabled: () => true, siteUrl: () => "https://app.example" }));

import { POST } from "@/app/api/alerts/subscribe/route";

function request(body: unknown, origin = "https://app.example") {
  return new NextRequest("https://app.example/api/alerts/subscribe", { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": "192.0.2.1" }, body: JSON.stringify(body) });
}

beforeEach(() => requestEmailAlert.mockReset());

describe("POST email alert subscription", () => {
  it("rejects cross-origin and malformed requests without persistence", async () => {
    expect((await POST(request({ email: "user@example.com", kind: "store", key: "Myer" }, "https://evil.example"))).status).toBe(403);
    expect((await POST(request({ email: "bad", kind: "store", key: "Myer" }))).status).toBe(400);
    expect(requestEmailAlert).not.toHaveBeenCalled();
  });

  it("queues a double-opt-in request and does not reveal existing subscriptions", async () => {
    requestEmailAlert.mockResolvedValue("queued");
    const response = await POST(request({ email: "User@Example.com", kind: "store", key: "JB Hi-Fi" }));
    expect(response.status).toBe(202);
    expect(requestEmailAlert).toHaveBeenCalledWith(expect.objectContaining({ email: "user@example.com", criteria: { kind: "store", key: "jb-hi-fi" }, baseUrl: "https://app.example" }));
    expect(await response.json()).toMatchObject({ ok: true, message: expect.stringContaining("If this alert is new") });

    requestEmailAlert.mockResolvedValue("already-active");
    const existing = await POST(request({ email: "User@Example.com", kind: "store", key: "JB Hi-Fi" }));
    expect(await existing.json()).toMatchObject({ ok: true, message: expect.stringContaining("If this alert is new") });
  });

  it("returns 429 when the atomic request budget is exhausted", async () => {
    requestEmailAlert.mockResolvedValue("rate-limited");
    expect((await POST(request({ email: "user@example.com", kind: "expiring-soon" }))).status).toBe(429);
  });
});
