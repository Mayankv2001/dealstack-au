import { describe, expect, it } from "vitest";
import { acceptancePublicView } from "@/lib/giftcards/acceptanceViewModel";
import { makeGiftCardAcceptance } from "../stack/factories";

const NOW = new Date("2026-07-15T00:00:00Z");

describe("public acceptance view model", () => {
  it("renders a full current official row", () => {
    expect(acceptancePublicView(makeGiftCardAcceptance({ lastCheckedAt: "2026-07-14T00:00:00Z" }), NOW)).toMatchObject({
      statusLabel: "Confirmed accepted",
      evidenceLabel: "Officially listed by Test issuer",
      freshnessLabel: "Current evidence",
      channelLabels: ["Online", "In store"],
      current: true,
      historical: false,
    });
  });

  it("keeps unofficial MCC wording and disclaimer together", () => {
    const view = acceptancePublicView(makeGiftCardAcceptance({ evidenceSourceType: "card-network-mcc", acceptanceStatus: "unofficially-reported", mcc: 5732, lastCheckedAt: "2026-07-14T00:00:00Z" }), NOW);
    expect(view.evidenceLabel).toBe("Unofficial MCC-based acceptance");
    expect(view.mccDisclaimer).toContain("Unofficial MCC-based acceptance");
  });

  it("marks stale, removed and null-heavy rows honestly", () => {
    expect(acceptancePublicView(makeGiftCardAcceptance({ lastCheckedAt: "2026-01-01T00:00:00Z" }), NOW)).toMatchObject({ freshnessLabel: "Stale — recheck required", current: false });
    expect(acceptancePublicView(makeGiftCardAcceptance({ acceptanceStatus: "confirmed-not-accepted", outcome: "unsuccessful" }), NOW)).toMatchObject({ statusLabel: "Confirmed not accepted", current: false, historical: true });
    expect(acceptancePublicView(makeGiftCardAcceptance({ acceptsOnline: null, acceptsInStore: null, acceptsApp: null, acceptsPhone: null, limitations: null, mcc: null, lastCheckedAt: null, checkedAt: null }), NOW)).toMatchObject({ channelsLabel: "Redemption channel not recorded.", limitationsLabel: null, mccDisclaimer: null, freshnessLabel: "Check date not recorded" });
  });
});

