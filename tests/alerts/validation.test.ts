import { describe, expect, it } from "vitest";
import { hashAlertToken, normaliseAlertBaseUrl, normaliseAlertKey, parseAlertRequest, unsubscribeTokenForCriteria, unsubscribeTokenForSubscription } from "@/lib/alerts/validation";

describe("email alert request validation", () => {
  it("normalises each supported keyed criterion", () => {
    expect(parseAlertRequest({ email: " USER@Example.com ", kind: "store", key: "JB Hi-Fi" })).toEqual({ ok: true, email: "user@example.com", criteria: { kind: "store", key: "jb-hi-fi" } });
    expect(parseAlertRequest({ email: "a@b.com", kind: "gift-card-brand", key: "Apple" })).toMatchObject({ ok: true, criteria: { key: "apple" } });
    expect(parseAlertRequest({ email: "a@b.com", kind: "programme", key: "Everyday Rewards" })).toMatchObject({ ok: true, criteria: { key: "everyday-rewards" } });
  });

  it("makes expiring-soon keyless and rejects malformed input", () => {
    expect(parseAlertRequest({ email: "a@b.com", kind: "expiring-soon", key: "ignored" })).toEqual({ ok: true, email: "a@b.com", criteria: { kind: "expiring-soon", key: null } });
    expect(parseAlertRequest({ email: "bad", kind: "store", key: "Myer" })).toMatchObject({ ok: false });
    expect(parseAlertRequest({ email: "a@b.com", kind: "store", key: "!!!" })).toMatchObject({ ok: false });
    expect(parseAlertRequest({ email: "a@b.com", kind: "unknown", key: "Myer" })).toMatchObject({ ok: false });
  });

  it("uses opaque deterministic unsubscribe tokens without embedding the address", () => {
    const token = unsubscribeTokenForSubscription("subscription-123", "test-secret");
    expect(token).toHaveLength(43);
    expect(token).not.toContain("subscription-123");
    expect(token).toBe(unsubscribeTokenForSubscription("subscription-123", "test-secret"));
    expect(hashAlertToken(token, "test-secret")).toMatch(/^[a-f0-9]{64}$/);
    expect(normaliseAlertKey(" Qantas / Frequent Flyer ")).toBe("qantas-frequent-flyer");
    const criteriaToken = unsubscribeTokenForCriteria(
      "user@example.com",
      { kind: "store", key: "jb-hi-fi" },
      "test-secret"
    );
    expect(criteriaToken).toHaveLength(43);
    expect(criteriaToken).not.toContain("user@example.com");
    expect(criteriaToken).toBe(
      unsubscribeTokenForCriteria(
        "user@example.com",
        { kind: "store", key: "jb-hi-fi" },
        "test-secret"
      )
    );
  });

  it("accepts only a bare HTTPS application origin for public email links", () => {
    expect(normaliseAlertBaseUrl("https://dealstack.example/")).toBe(
      "https://dealstack.example"
    );
    expect(normaliseAlertBaseUrl("http://dealstack.example")).toBeNull();
    expect(normaliseAlertBaseUrl("https://dealstack.example/a/path")).toBeNull();
    expect(normaliseAlertBaseUrl("https://user@dealstack.example")).toBeNull();
  });
});
