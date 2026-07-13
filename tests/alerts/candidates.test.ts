import { describe, expect, it } from "vitest";
import {
  cashbackAlertCandidate,
  offerAlertCandidate,
  pointsAlertCandidate,
  weeklyAlertCandidate,
} from "@/lib/alerts/repo";
import { alertCandidateMatches } from "@/lib/alerts/matching";

describe("reviewed alert candidate projections", () => {
  it("matches store alerts across all reviewed public offer families", () => {
    const candidates = [
      offerAlertCandidate({ id: "gc", brand: "Apple", purchase_location: "JB Hi-Fi", promotion_type: "discount", discount_percent: 10, bonus_percent: null, points_multiplier: null, points_program: null, expiry_date: "2026-07-15" }),
      cashbackAlertCandidate({ id: "cb", merchant_id: "jb-hi-fi", provider: "ShopBack", rate_percent: 5, flat_amount: null, expiry_date: "2026-07-15" }),
      pointsAlertCandidate({ id: "pt", merchant_id: "jb-hi-fi", program: "Qantas", earn_rate_display: "3 points per $1", expiry_date: "2026-07-15" }),
      weeklyAlertCandidate({ id: "wk", merchant_id: "jb-hi-fi", title: "JB Hi-Fi weekly pick", highlight: "Reviewed offer", expiry_date: "2026-07-15" }),
    ];
    expect(
      candidates.every((candidate) =>
        alertCandidateMatches(
          { kind: "store", key: "jb-hi-fi" },
          candidate,
          "2026-07-13"
        )
      )
    ).toBe(true);
  });

  it("keeps programme and gift-card-brand criteria distinct", () => {
    const points = pointsAlertCandidate({ id: "pt", merchant_id: null, program: "Everyday Rewards", earn_rate_display: "20× points", expiry_date: null });
    const giftCard = offerAlertCandidate({ id: "gc", brand: "Apple", purchase_location: "Woolworths", promotion_type: "points", discount_percent: null, bonus_percent: null, points_multiplier: 20, points_program: "Everyday Rewards", expiry_date: "2026-07-15" });
    expect(alertCandidateMatches({ kind: "programme", key: "everyday-rewards" }, points, "2026-07-13")).toBe(true);
    expect(alertCandidateMatches({ kind: "gift-card-brand", key: "apple" }, points, "2026-07-13")).toBe(false);
    expect(alertCandidateMatches({ kind: "gift-card-brand", key: "apple" }, giftCard, "2026-07-13")).toBe(true);
  });
});
