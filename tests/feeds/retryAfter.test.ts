import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "../../lib/feeds/retryAfter";

const NOW = new Date("2026-06-15T00:00:00.000Z");

describe("parseRetryAfter", () => {
  it("parses the delta-seconds form", () => {
    expect(parseRetryAfter("120", NOW)).toBe(120);
  });

  it("parses an HTTP-date into a positive delta", () => {
    const future = new Date(NOW.getTime() + 90_000).toUTCString();
    expect(parseRetryAfter(future, NOW)).toBe(90);
  });

  it("clamps a past HTTP-date to 0", () => {
    const past = new Date(NOW.getTime() - 90_000).toUTCString();
    expect(parseRetryAfter(past, NOW)).toBe(0);
  });

  it("returns null for missing, blank, or unparseable values", () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter(undefined, NOW)).toBeNull();
    expect(parseRetryAfter("", NOW)).toBeNull();
    expect(parseRetryAfter("soon", NOW)).toBeNull();
  });
});
