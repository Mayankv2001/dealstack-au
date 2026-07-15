import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { giftCardLifecycleEnabled } from "@/lib/env";

const previous = process.env.GIFT_CARD_LIFECYCLE_ENABLED;

afterEach(() => {
  if (previous === undefined) delete process.env.GIFT_CARD_LIFECYCLE_ENABLED;
  else process.env.GIFT_CARD_LIFECYCLE_ENABLED = previous;
});

describe("gift-card lifecycle deployment gates", () => {
  it("is disabled by default and only exact true enables it", () => {
    delete process.env.GIFT_CARD_LIFECYCLE_ENABLED;
    expect(giftCardLifecycleEnabled()).toBe(false);
    process.env.GIFT_CARD_LIFECYCLE_ENABLED = "TRUE";
    expect(giftCardLifecycleEnabled()).toBe(false);
    process.env.GIFT_CARD_LIFECYCLE_ENABLED = "true";
    expect(giftCardLifecycleEnabled()).toBe(true);
  });

  it("documents the closed gate and uses distinct dual-UTC workflow minutes", () => {
    const env = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const workflow = readFileSync(
      new URL("../../.github/workflows/gift-card-lifecycle.yml", import.meta.url),
      "utf8",
    );
    expect(env).toContain("GIFT_CARD_LIFECYCLE_ENABLED=false");
    expect(workflow).toContain('cron: "7 20 * * *"');
    expect(workflow).toContain('cron: "7 21 * * *"');
    expect(workflow).toContain("/api/cron/gift-card-lifecycle");
    expect(workflow).not.toContain("?force=1");
  });
});
