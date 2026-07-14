import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SourceResultCard from "@/components/SourceResultCard";
import { DealStatusBadge } from "@/components/deals/DealStatusBadge";
import type { DealSourceResult } from "@/lib/sources/types";

describe("public verification wording", () => {
  it("distinguishes source confirmation from completed DealStack verification", () => {
    const sourceOnly = renderToStaticMarkup(
      <DealStatusBadge trust="verified" dealStackVerified={false} />,
    );
    const completed = renderToStaticMarkup(
      <DealStatusBadge trust="verified" dealStackVerified />,
    );

    expect(sourceOnly).toContain("Source confirmed");
    expect(sourceOnly).not.toContain("DealStack verified");
    expect(completed).toContain("DealStack verified");
  });

  it("renders an internal record neutrally and never links it to the homepage", () => {
    const result: DealSourceResult = {
      id: "manual:1",
      source: "manual",
      kind: "guide",
      title: "Internal calculation record",
      merchant: "Myer",
      merchantId: "myer",
      summary: "Calculated from approved structured fields.",
      discountPercent: null,
      pointsProgram: null,
      pointsAmount: null,
      giftCardBrand: null,
      cardOrProvider: null,
      expiryDate: null,
      startDate: null,
      sourceUrl: "/",
      publishedAt: null,
      lastCheckedAt: "2026-07-14T00:00:00Z",
      confidence: "needs-verification",
    };
    const html = renderToStaticMarkup(<SourceResultCard result={result} />);

    expect(html).toContain("DealStack record");
    expect(html).not.toContain("DealStack verified");
    expect(html).not.toContain("View source");
    expect(html).not.toContain('href="/"');
  });
});
