import { describe, expect, it, vi } from "vitest";
import { buildEmailDeliveryPayload, deliverAlertEmail } from "@/lib/alerts/delivery";
import type { AlertOutboxRow } from "@/lib/alerts/repo";

const row: AlertOutboxRow = { id: "outbox-1", subscription_id: "sub-1", message_kind: "alert", recipient_email: "user@example.com", payload: { title: "Apple at Woolworths", unsubscribeUrl: "https://dealstack.example/api/alerts/unsubscribe?token=x" }, attempts: 1 };

describe("email alert delivery adapter", () => {
  it("sends only the structured template payload", async () => {
    let captured: { input: RequestInfo | URL; init?: RequestInit } | null = null;
    const fetcher: typeof fetch = async (input, init) => {
      captured = { input, init };
      return new Response(null, { status: 202 });
    };
    await deliverAlertEmail(row, { endpoint: "https://mailer.example/send", token: "secret" }, fetcher);
    expect(captured).not.toBeNull();
    const request = captured as unknown as { input: RequestInfo | URL; init?: RequestInit };
    expect(request.input).toBe("https://mailer.example/send");
    expect(JSON.parse(String(request.init?.body))).toEqual(buildEmailDeliveryPayload(row));
    expect(new Headers(request.init?.headers).get("Authorization")).toBe("Bearer secret");
  });

  it("rejects unsafe endpoints and non-success responses", async () => {
    await expect(deliverAlertEmail(row, { endpoint: "http://mailer.example/send", token: null })).rejects.toThrow(/safe HTTPS/);
    await expect(deliverAlertEmail(row, { endpoint: "https://mailer.example/send", token: null }, vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch)).rejects.toThrow(/HTTP 500/);
  });
});
