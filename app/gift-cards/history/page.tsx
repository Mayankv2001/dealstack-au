import type { Metadata } from "next";
import Link from "next/link";
import GiftCardsSubnav from "@/components/GiftCardsSubnav";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAllGiftCardAcceptance,
  getAllGiftCardProducts,
  getGiftCardOfferOccurrences,
} from "@/lib/repos";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  summariseOfferHistory,
  type OfferOccurrence,
} from "@/lib/giftcards/history";
import { savedPlanHistoryWarnings } from "@/lib/giftcards/historyViewModel";
import { acceptancePublicView } from "@/lib/giftcards/acceptanceViewModel";

export const metadata: Metadata = {
  title: "Gift-card offer history | DealStack AU",
  description:
    "Public-safe verified gift-card offer occurrences, separated by seller, product and promotion mechanic.",
};
export const revalidate = 300;

function occurrenceValue(
  occurrence: Awaited<ReturnType<typeof getGiftCardOfferOccurrences>>[number],
): string {
  if ((occurrence.discountPercent ?? 0) > 0)
    return `${occurrence.discountPercent}% discount`;
  if ((occurrence.bonusPercent ?? 0) > 0)
    return `${occurrence.bonusPercent}% bonus value`;
  if ((occurrence.pointsMultiplier ?? 0) > 0)
    return `${occurrence.pointsMultiplier}× ${occurrence.pointsProgramme ?? "points"}`;
  if ((occurrence.fixedPoints ?? 0) > 0)
    return `${occurrence.fixedPoints!.toLocaleString("en-AU")} ${occurrence.pointsProgramme ?? "points"}`;
  if ((occurrence.fixedDollars ?? 0) > 0)
    return `$${occurrence.fixedDollars} ${occurrence.promotionType.replaceAll("-", " ")}`;
  return occurrence.promotionType.replaceAll("-", " ");
}

function numericValue(
  occurrence: Awaited<ReturnType<typeof getGiftCardOfferOccurrences>>[number],
): number {
  return (
    occurrence.discountPercent ??
    occurrence.bonusPercent ??
    occurrence.pointsMultiplier ??
    occurrence.fixedPoints ??
    occurrence.fixedDollars ??
    0
  );
}

function historyUnit(promotionType: string): string {
  if (promotionType === "points") return "× points";
  if (
    promotionType === "fixed-dollar-discount" ||
    promotionType === "promo-credit" ||
    promotionType === "fee-waiver"
  )
    return " dollars";
  return "%";
}

type Params = {
  offer?: string | string[];
  acceptance?: string | string[];
  planCreatedAt?: string | string[];
};

const first = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value)?.trim() || null;

export default async function GiftCardHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const [occurrences, acceptance, products] = await Promise.all([
    getGiftCardOfferOccurrences(),
    getAllGiftCardAcceptance(),
    getAllGiftCardProducts(),
  ]);
  const now = new Date();
  const productById = new Map(products.map((product) => [product.id, product]));
  const historicalAcceptance = acceptance.filter(
    (row) => acceptancePublicView(row, now).historical,
  );
  const planWarnings = savedPlanHistoryWarnings(
    {
      offerId: first(params.offer),
      acceptanceId: first(params.acceptance),
      planCreatedAt: first(params.planCreatedAt),
    },
    occurrences,
    acceptance,
  );
  const historyRows: OfferOccurrence[] = occurrences.map((occurrence) => ({
    id: occurrence.id,
    sellerKey: occurrence.sellerKey,
    productKey: occurrence.productKey,
    mechanic: occurrence.promotionType,
    value: numericValue(occurrence),
    startDate: occurrence.startDate,
    endDate: occurrence.endDate,
    verifiedAt: occurrence.verifiedAt,
  }));
  const seen = new Set<string>();
  const groups = occurrences.flatMap((occurrence) => {
    const key = `${occurrence.sellerKey}|${occurrence.productKey}|${occurrence.promotionType}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const summary = summariseOfferHistory(
      historyRows.find((row) => row.id === occurrence.id)!,
      historyRows,
    );
    const ids = new Set(summary.comparable.map((row) => row.id));
    return [
      {
        key,
        occurrence,
        summary,
        rows: occurrences
          .filter((row) => ids.has(row.id))
          .sort((a, b) => b.endDate.localeCompare(a.endDate)),
      },
    ];
  });
  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <GiftCardsSubnav current="/gift-cards/history" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Verified offer history
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          History compares only the same seller, product and mechanic.
          Discounts, bonus value and points are never blended.
        </p>
        {planWarnings.length > 0 ? (
          <ul
            role="status"
            className="mt-5 space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
          >
            {planWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {occurrences.length === 0 ? (
          <Card className="mt-7">
            <CardContent className="p-8 text-center">
              <h2 className="font-semibold">
                Offer history is not available yet
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Verified past occurrences will appear here once the history
                records are approved for publication. Only reviewed, public-safe
                facts are ever shown — raw feeds, review notes and audit records
                stay private.
              </p>
              <Link
                href="/gift-cards"
                className="mt-4 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"
              >
                Return to current offers
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-7 space-y-5">
            {groups.map(({ key, occurrence, summary, rows }) => (
              <section
                key={key}
                className="overflow-hidden rounded-2xl border bg-card"
              >
                <header className="border-b bg-muted/35 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {occurrence.sellerName} ·{" "}
                    {occurrence.promotionType.replaceAll("-", " ")}
                  </p>
                  <h2 className="mt-1 font-semibold">
                    {occurrence.productName}
                  </h2>
                  {summary.canPredict ? (
                    <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
                      Median verified value: {summary.medianValue}
                      {historyUnit(occurrence.promotionType)} · Typical
                      interval: {summary.typicalFrequencyDays} days
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {summary.comparable.length} comparable occurrence
                      {summary.comparable.length === 1 ? "" : "s"}; at least 3
                      are required before showing a median or typical interval.
                    </p>
                  )}
                </header>
                <div className="divide-y">
                  {rows.map((row) => (
                    <article
                      key={row.id}
                      className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div>
                        <p className="font-medium">{occurrenceValue(row)}</p>
                        {row.startDate ? (
                          <p className="text-xs text-muted-foreground">
                            Started {formatDateAU(row.startDate)}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-sm sm:text-right">
                        <p className="font-medium">
                          Ended {formatDateAU(row.endDate)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Verified {formatDateAU(row.verifiedAt.slice(0, 10))}
                        </p>
                        {safePublicSourceUrl(row.sourceUrl) ? (
                          <a
                            href={safePublicSourceUrl(row.sourceUrl)!}
                            target="_blank"
                            rel="nofollow noopener noreferrer"
                            className="text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            Occurrence source
                          </a>
                        ) : (
                          <p className="text-xs text-amber-700">
                            Source unavailable
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <section className="mt-8" aria-labelledby="acceptance-history">
          <h2 id="acceptance-history" className="text-xl font-semibold">
            Merchant acceptance history
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Relationships that were reviewed as no longer accepted remain
            visible here with their original evidence. They are excluded from
            current purchase plans.
          </p>
          {historicalAcceptance.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {historicalAcceptance.map((row) => {
                const view = acceptancePublicView(row, now);
                const evidenceUrl = view.evidenceUrl;
                return (
                  <article key={row.id} className="rounded-xl border bg-card p-4">
                    <h3 className="font-semibold">
                      {productById.get(row.productId)?.brand ?? row.productId}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.merchantName ?? row.merchantCategory ?? row.storeId ?? "Merchant not named"}
                    </p>
                    <p className="mt-3 text-sm font-medium">{view.statusLabel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {view.evidenceLabel} · {view.checkedLabel}
                      {row.validUntil ? ` · valid until ${formatDateAU(row.validUntil)}` : ""}
                    </p>
                    {evidenceUrl ? (
                      <a
                        href={evidenceUrl}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="mt-3 inline-flex text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        Acceptance evidence
                      </a>
                    ) : (
                      <p className="mt-3 text-xs text-amber-700">Evidence link unavailable</p>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No reviewed merchant-acceptance removals are recorded yet.
            </p>
          )}
        </section>
        <section className="mt-8 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Prediction threshold</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Typical frequency or median value appears only after three
            comparable verified occurrences. Before then, this page shows exact
            prior occurrences without prediction.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
