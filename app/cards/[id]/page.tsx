import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  ExternalLink,
  History,
  Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { ReportOfferForm } from "@/components/ReportOfferForm";
import { estimateFirstYearValue } from "@/lib/offers/cardValue";
import { getCardOfferHistory, getPublicCardOffer } from "@/lib/repos";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";

const DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Australia/Melbourne",
});

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const offer = await getPublicCardOffer(id);
  return offer
    ? {
        title: `${offer.provider} ${offer.cardName} | DealStack AU`,
        description: offer.offerSummary,
      }
    : { title: "Card offer not found | DealStack AU" };
}

export default async function CardOfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [offer, history] = await Promise.all([
    getPublicCardOffer(id),
    getCardOfferHistory(id),
  ]);
  if (!offer) notFound();

  const estimate = estimateFirstYearValue(offer);
  const source = safePublicSourceUrl(offer.sourceUrl);

  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href="/cards"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All card offers
        </Link>
        <div className="flex flex-col gap-3 border-b pb-6">
          <Badge variant="outline" className="w-fit">
            <Landmark />
            Verified card offer
          </Badge>
          <h1 className="text-3xl font-bold">
            {offer.provider} {offer.cardName}
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {offer.offerSummary}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarCheck className="size-4" />
            Checked {DATE.format(new Date(offer.lastCheckedAt))}; review due{" "}
            {DATE.format(new Date(`${offer.reviewByDate}T12:00:00+10:00`))}
          </p>
        </div>

        <div className="grid gap-6 py-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Offer structure</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {offer.bonusStages.length > 0 ? (
                  <ol className="space-y-3">
                    {offer.bonusStages.map((stage, index) => (
                      <li
                        key={`${stage.points}-${index}`}
                        className="grid grid-cols-[auto_1fr] gap-3 border-b pb-3 last:border-0 last:pb-0"
                      >
                        <span className="text-lg font-bold tabular-nums">
                          {stage.points.toLocaleString("en-AU")}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{stage.timing}</p>
                          <p className="text-xs text-muted-foreground">
                            {stage.requirement}
                            {stage.withinFirstYear
                              ? ""
                              : " · Not counted in first-year value"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No staged points bonus.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Eligibility and timing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{offer.eligibilityNotes}</p>
                <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Qualifying spend</dt>
                    <dd className="font-medium">
                      {offer.minimumSpend == null
                        ? "Not specified"
                        : `${money.format(offer.minimumSpend)}${offer.minimumSpendPeriod ? ` in ${offer.minimumSpendPeriod}` : ""}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Offer expiry</dt>
                    <dd className="font-medium">
                      {offer.expiryDate
                        ? DATE.format(
                            new Date(`${offer.expiryDate}T12:00:00+10:00`),
                          )
                        : "Ongoing; no fixed issuer date"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="size-4" />
                  Verification history
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length > 0 ? (
                  <ol className="space-y-3">
                    {history.map((entry) => (
                      <li
                        key={entry.id}
                        className="border-b pb-3 text-sm last:border-0"
                      >
                        <p>{entry.changeSummary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {DATE.format(new Date(entry.checkedAt))}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No material changes recorded since public history began.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Estimated first-year value</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-3xl font-bold tabular-nums">
                  {estimate.netValue == null
                    ? "Not available"
                    : money.format(estimate.netValue)}
                </p>
                <dl className="space-y-2 border-t pt-3 text-xs">
                  <div className="flex justify-between">
                    <dt>First-year points</dt>
                    <dd>{estimate.firstYearPoints.toLocaleString("en-AU")}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Estimated points value</dt>
                    <dd>
                      {estimate.pointsValue == null
                        ? "No valuation"
                        : money.format(estimate.pointsValue)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Cash benefits</dt>
                    <dd>{money.format(estimate.cashBenefits)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Annual fee</dt>
                    <dd>−{money.format(estimate.annualFee)}</dd>
                  </div>
                </dl>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Estimate uses{" "}
                  {offer.pointValueCents == null
                    ? "no points valuation"
                    : `${offer.pointValueCents} cents per point`}{" "}
                  and assumes every listed first-year requirement is met. It is
                  not financial advice.
                </p>
              </CardContent>
            </Card>
            {source ? (
              <Button asChild className="w-full">
                <a
                  href={source}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                >
                  Check current issuer terms
                  <ExternalLink />
                </a>
              </Button>
            ) : null}
            <ReportOfferForm offerId={offer.id} />
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
