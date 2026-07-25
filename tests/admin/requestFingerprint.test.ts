import { describe, expect, it } from "vitest";
import {
  clientRateLimitIp,
  dailyRequestFingerprint,
} from "@/lib/security/requestFingerprint";

const SALT = "test-salt";
const DAY = new Date("2026-07-25T04:00:00.000Z");

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("clientRateLimitIp", () => {
  it("prefers the platform-set x-real-ip over anything the client sends", () => {
    expect(
      clientRateLimitIp(
        headers({
          "x-real-ip": "203.0.113.7",
          "x-forwarded-for": "1.1.1.1, 203.0.113.7",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to the last x-vercel-forwarded-for entry", () => {
    expect(
      clientRateLimitIp(
        headers({ "x-vercel-forwarded-for": "9.9.9.9, 203.0.113.9" }),
      ),
    ).toBe("203.0.113.9");
  });

  // The client can prepend to x-forwarded-for; the platform appends the real
  // peer. Taking the first entry let a caller mint a fresh bucket per request.
  it("takes the LAST x-forwarded-for entry, not the client-spoofable first", () => {
    expect(
      clientRateLimitIp(
        headers({ "x-forwarded-for": "10.0.0.1, 172.16.0.1, 203.0.113.4" }),
      ),
    ).toBe("203.0.113.4");
  });

  it("returns a stable placeholder when no address header is present", () => {
    expect(clientRateLimitIp(headers({}))).toBe("unknown");
  });
});

describe("dailyRequestFingerprint", () => {
  it("ignores User-Agent entirely, so rotating it cannot defeat the throttle", () => {
    const a = dailyRequestFingerprint(
      headers({ "x-real-ip": "203.0.113.7", "user-agent": "Mozilla/5.0" }),
      SALT,
      DAY,
    );
    const b = dailyRequestFingerprint(
      headers({ "x-real-ip": "203.0.113.7", "user-agent": "curl/8.4.0" }),
      SALT,
      DAY,
    );
    expect(a).toBe(b);
  });

  it("ignores a client-supplied x-forwarded-for prefix for the same real peer", () => {
    const honest = dailyRequestFingerprint(
      headers({ "x-forwarded-for": "203.0.113.4" }),
      SALT,
      DAY,
    );
    const spoofed = dailyRequestFingerprint(
      headers({ "x-forwarded-for": "8.8.8.8, 203.0.113.4" }),
      SALT,
      DAY,
    );
    expect(spoofed).toBe(honest);
  });

  it("separates different callers", () => {
    const one = dailyRequestFingerprint(
      headers({ "x-real-ip": "203.0.113.7" }),
      SALT,
      DAY,
    );
    const two = dailyRequestFingerprint(
      headers({ "x-real-ip": "203.0.113.8" }),
      SALT,
      DAY,
    );
    expect(one).not.toBe(two);
  });

  it("namespaces buckets by salt so the two report endpoints throttle apart", () => {
    const head = headers({ "x-real-ip": "203.0.113.7" });
    expect(dailyRequestFingerprint(head, "salt-a", DAY)).not.toBe(
      dailyRequestFingerprint(head, "salt-b", DAY),
    );
  });

  it("rolls over daily", () => {
    const head = headers({ "x-real-ip": "203.0.113.7" });
    expect(dailyRequestFingerprint(head, SALT, DAY)).not.toBe(
      dailyRequestFingerprint(head, SALT, new Date("2026-07-26T04:00:00.000Z")),
    );
  });

  it("never leaks the raw address into the stored value", () => {
    const fp = dailyRequestFingerprint(
      headers({ "x-real-ip": "203.0.113.7" }),
      SALT,
      DAY,
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain("203.0.113.7");
  });
});
