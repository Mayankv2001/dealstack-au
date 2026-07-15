import { describe, expect, it } from "vitest";
import {
  EXPIRED_SAVED_PLAN_WARNING,
  savedPlanHistoryWarnings,
} from "@/lib/giftcards/historyViewModel";
import { ACCEPTANCE_CHANGED_WARNING } from "@/lib/giftcards/reconcileAcceptance";
import type { PublicGiftCardOccurrence } from "@/lib/repos/giftCardIntelligence";
import { makeGiftCardAcceptance } from "../stack/factories";

const occurrence = {
  id: "occurrence-1",
  sourceOfferId: "offer-1",
} as PublicGiftCardOccurrence;

describe("saved-plan history warnings", () => {
  it("shows expired-offer and changed-acceptance warnings from saved-plan context", () => {
    const warnings = savedPlanHistoryWarnings(
      {
        offerId: "offer-1",
        acceptanceId: "acceptance-1",
        planCreatedAt: "2026-07-01T00:00:00Z",
      },
      [occurrence],
      [
        makeGiftCardAcceptance({
          id: "acceptance-1",
          lastCheckedAt: "2026-07-14T00:00:00Z",
        }),
      ],
    );
    expect(warnings).toEqual([
      EXPIRED_SAVED_PLAN_WARNING,
      ACCEPTANCE_CHANGED_WARNING,
    ]);
  });

  it("does not warn for unrelated or unchanged plan references", () => {
    expect(
      savedPlanHistoryWarnings(
        {
          offerId: "other",
          acceptanceId: "acceptance-1",
          planCreatedAt: "2026-07-15T00:00:00Z",
        },
        [occurrence],
        [
          makeGiftCardAcceptance({
            id: "acceptance-1",
            lastCheckedAt: "2026-07-14T00:00:00Z",
          }),
        ],
      ),
    ).toEqual([]);
  });
});
