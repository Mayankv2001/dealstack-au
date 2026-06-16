import { describe, expect, it } from "vitest";
import {
  FAILURE_DISABLE_THRESHOLD,
  nextEarliestAfterFailure,
  nextEarliestAfterSuccess,
  parseRetryAfter,
  shouldAutoDisable,
} from "../../lib/monitor/backoff";

const NOW = new Date("2026-06-15T00:00:00.000Z");
const minutesFrom = (iso: string): number =>
  (Date.parse(iso) - NOW.getTime()) / 60_000;

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

describe("nextEarliestAfterSuccess", () => {
  it("is now plus the minimum interval", () => {
    expect(minutesFrom(nextEarliestAfterSuccess(NOW, 12))).toBe(12 * 60);
  });
});

describe("nextEarliestAfterFailure", () => {
  it("backs off exponentially from 30 minutes", () => {
    expect(minutesFrom(nextEarliestAfterFailure(NOW, 1, null))).toBe(30);
    expect(minutesFrom(nextEarliestAfterFailure(NOW, 2, null))).toBe(60);
    expect(minutesFrom(nextEarliestAfterFailure(NOW, 3, null))).toBe(120);
  });

  it("caps the backoff at 48 hours", () => {
    expect(minutesFrom(nextEarliestAfterFailure(NOW, 20, null))).toBe(48 * 60);
  });

  it("never schedules sooner than a server Retry-After", () => {
    // failureCount 1 would be 30m, but a 2h Retry-After wins.
    expect(minutesFrom(nextEarliestAfterFailure(NOW, 1, 7200))).toBe(120);
  });
});

describe("shouldAutoDisable", () => {
  it("trips exactly at the threshold", () => {
    expect(shouldAutoDisable(FAILURE_DISABLE_THRESHOLD - 1)).toBe(false);
    expect(shouldAutoDisable(FAILURE_DISABLE_THRESHOLD)).toBe(true);
  });
});
