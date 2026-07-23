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

    // The SCHEDULED cron must never bypass the 07:00 Sydney hour gate. A manual
    // workflow_dispatch may force an on-demand run, but that force is gated
    // behind the `force` input — which is EMPTY on scheduled runs — so the daily
    // cron always respects the hour gate. Assert the precise contract rather
    // than banning the string outright: force is sourced from the manual input,
    // is conditional, and appears exactly once (the guarded url assignment).
    expect(workflow).toContain("FORCE: ${{ inputs.force }}");
    expect(workflow).toContain('if [ "$FORCE" = "true" ]');
    expect(workflow).toContain('url="$url?force=1"');
    expect(workflow.match(/\?force=1/g)?.length ?? 0).toBe(1);
  });
});
