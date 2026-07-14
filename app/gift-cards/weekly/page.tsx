import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  History,
  ShieldCheck,
  ShoppingBasket,
} from "lucide-react";
import GiftCardsSubnav from "@/components/GiftCardsSubnav";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { publicFreshness } from "@/lib/freshness";
import { getGiftCardOfferOccurrences, getGiftCardOffers } from "@/lib/repos";
import { formatDateAU } from "@/lib/sources/normalise";
import { buildWorkedExample } from "@/lib/giftcards/value";
import {
  parseWeeklyView,
  queryWeeklyOffers,
  weeklyAttribution,
  weeklyPlanHref,
  WEEKLY_VIEW_LABEL,
  type WeeklyOfferView,
} from "@/lib/giftcards/weeklyOffers";
import type { GiftCardOffer } from "@/lib/offers/types";

export const metadata: Metadata = {
  title: "Weekly supermarket gift-card offers | DealStack AU",
  description:
    "Reviewed Coles, Woolworths, Flybuys and Everyday Rewards gift-card promotions with separate source, reward and planning facts.",
};
export const revalidate = 300;

type RawSearchParams = { view?: string | string[] };
const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function mechanic(offer: GiftCardOffer): string {
  if ((offer.bonusPercent ?? 0) > 0)
    return `${offer.bonusPercent}% bonus card value`;
  if ((offer.pointsMultiplier ?? 0) > 0)
    return `${offer.pointsMultiplier}× ${offer.pointsProgram ?? "points"}`;
  if ((offer.fixedPoints ?? 0) > 0)
    return `${offer.fixedPoints?.toLocaleString("en-AU")} ${offer.pointsProgram ?? "points"}`;
  if (offer.pointsOnPurchase)
    return `Bonus ${offer.pointsOnPurchase.program} points`;
  if (offer.discountPercent > 0) return `${offer.discountPercent}% off`;
  return (offer.promotionType ?? "Reviewed offer").replaceAll("-", " ");
}

function offerValue(offer: GiftCardOffer): string | null {
  const example = buildWorkedExample(
    {
      promotionType: offer.promotionType ?? "discount",
      discountPercent: offer.discountPercent || null,
      bonusPercent: offer.bonusPercent ?? null,
      pointsMultiplier: offer.pointsMultiplier ?? null,
      fixedPoints: offer.fixedPoints ?? null,
      pointsProgram:
        offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null,
      pointsValueCents: offer.pointsValueCents ?? null,
      capDollars: offer.capDollars,
    },
    100,
  );
  if (!example) return null;
  if (example.bonusValueDollars != null)
    return `Pay $${example.cashPaid.toFixed(2)} · receive $${example.totalSpendingPower.toFixed(2)} card value`;
  if (example.points != null && example.rewardValueDollars != null)
    return `${example.points.toLocaleString("en-AU")} points · about $${example.rewardValueDollars.toFixed(2)} rewards value per $100`;
  if (example.acquisitionSaving > 0)
    return `$${example.acquisitionSaving.toFixed(2)} immediate saving per $100`;
  return null;
}

function WeeklyOfferRow({ offer, now }: { offer: GiftCardOffer; now: Date }) {
  const attribution = weeklyAttribution(offer);
  const freshness = publicFreshness(offer.lastCheckedAt, now);
  const value = offerValue(offer);
  const exclusions = (offer.usageNotes ?? []).filter((note) =>
    /exclud|not valid|selected denomination/i.test(note),
  );
  return (
    <article className="grid gap-4 border-b p-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-800">
            Buy from {offer.purchaseLocation ?? offer.source}
          </span>
          {offer.pointsProgram || offer.pointsOnPurchase?.program ? (
            <span>{offer.pointsProgram ?? offer.pointsOnPurchase?.program}</span>
          ) : null}
        </div>
        <h2 className="mt-2 text-lg font-bold">{offer.brand}</h2>
        <p className="mt-1 font-semibold text-emerald-800">{mechanic(offer)}</p>
        {value ? (
          <p className="mt-1 text-sm text-muted-foreground">{value}</p>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="font-semibold text-muted-foreground">Offer period</dt>
          <dd>{formatDateAU(offer.startDate!)}–{formatDateAU(offer.expiryDate!)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">Freshness</dt>
          <dd>{freshness.label}{freshness.checkedDate ? ` · ${freshness.checkedDate}` : ""}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">Limits</dt>
          <dd>{offer.limitPerCustomer ?? (offer.capDollars ? `Up to $${offer.capDollars}` : "Not recorded")}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">Denominations</dt>
          <dd>{offer.denominationNote ?? "Not recorded"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-semibold text-muted-foreground">Key exclusions</dt>
          <dd>{exclusions.length ? exclusions.slice(0, 2).join(" · ") : "Not recorded"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2 lg:max-w-48 lg:flex-col">
        <Link
          href={weeklyPlanHref(offer)}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800"
        >
          Use in a purchase plan <ArrowRight aria-hidden className="size-3.5" />
        </Link>
        <Link
          href={`/gift-cards/${offer.id}`}
          className="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold hover:bg-muted"
        >
          Full conditions
        </Link>
      </div>
      <div className="space-y-1 text-[11px] text-muted-foreground lg:col-span-3">
        <p>
          <span className="font-semibold text-foreground">Retailer evidence:</span>{" "}
          {attribution.retailerEvidenceUrl ? (
            <a className="font-semibold text-emerald-700 hover:underline" href={attribution.retailerEvidenceUrl} target="_blank" rel="nofollow noopener noreferrer">Open catalogue or promotion <ExternalLink aria-hidden className="inline size-3" /></a>
          ) : "Not attached"}
        </p>
        <p>
          <span className="font-semibold text-foreground">Discovered via:</span>{" "}
          {attribution.discoverySource ? (
            <a className="font-semibold text-emerald-700 hover:underline" href={attribution.discoverySource.url} target="_blank" rel="nofollow noopener noreferrer">{attribution.discoverySource.name}</a>
          ) : "Not recorded"}
          {attribution.corroboration.length
            ? ` · Corroborated by ${attribution.corroboration.map((item) => item.name).join(", ")}`
            : ""}
          {` · ${attribution.reviewStatus}`}
        </p>
      </div>
    </article>
  );
}

function historyValue(row: Awaited<ReturnType<typeof getGiftCardOfferOccurrences>>[number]): string {
  if (row.discountPercent) return `${row.discountPercent}% off`;
  if (row.bonusPercent) return `${row.bonusPercent}% bonus value`;
  if (row.pointsMultiplier)
    return `${row.pointsMultiplier}× ${row.pointsProgramme ?? "points"}`;
  if (row.fixedPoints)
    return `${row.fixedPoints.toLocaleString("en-AU")} ${row.pointsProgramme ?? "points"}`;
  if (row.fixedDollars) return `$${row.fixedDollars}`;
  return row.promotionType.replaceAll("-", " ");
}

export default async function WeeklyGiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const view = parseWeeklyView(first((await searchParams).view));
  const now = new Date();
  const [allOffers, occurrences] = await Promise.all([
    getGiftCardOffers(),
    view === "history" ? getGiftCardOfferOccurrences() : Promise.resolve([]),
  ]);
  const currentOffers = queryWeeklyOffers(allOffers, "week", now);
  const offers =
    view === "history" ? [] : queryWeeklyOffers(currentOffers, view, now);
  const history = occurrences.filter((row) =>
    /^(coles|woolworths)/i.test(row.sellerName),
  );
  const periods = [...new Set(currentOffers.map((offer) => `${offer.startDate}|${offer.expiryDate}`))];
  const lastChecked = currentOffers
    .map((offer) => offer.lastCheckedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
        <GiftCardsSubnav current="/gift-cards/weekly" />
        <section className="mt-4 rounded-2xl border bg-card p-5 sm:p-7">
          <p className="eyebrow inline-flex items-center gap-2">
            <ShoppingBasket aria-hidden className="size-4" /> Weekly supermarket offers
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            This week’s supermarket gift-card offers
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Approved Coles and Woolworths promotions, with cash, card value and
            points kept separate. Point Hacks may help discover an offer, but
            its publication alone never makes the offer DealStack verified.
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs font-semibold text-muted-foreground">Active offer period</dt>
              <dd className="mt-1 font-bold">{periods.length === 1 ? `${formatDateAU(periods[0].split("|")[0])}–${formatDateAU(periods[0].split("|")[1])}` : periods.length > 1 ? "Multiple confirmed periods" : "No confirmed active period"}</dd>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs font-semibold text-muted-foreground">Last checked</dt>
              <dd className="mt-1 font-bold">{lastChecked ? formatDateAU(lastChecked.slice(0, 10)) : "Not available"}</dd>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs font-semibold text-muted-foreground">Current approved offers</dt>
              <dd className="mt-1 font-bold">{currentOffers.length}</dd>
            </div>
          </dl>
        </section>

        <nav aria-label="Weekly offer views" className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          {(Object.keys(WEEKLY_VIEW_LABEL) as WeeklyOfferView[]).map((item) => (
            <Link
              key={item}
              href={item === "week" ? "/gift-cards/weekly" : `/gift-cards/weekly?view=${item}`}
              aria-current={item === view ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${item === view ? "border-emerald-700 bg-emerald-700 text-white" : "bg-card text-muted-foreground hover:border-emerald-500/50"}`}
            >
              {WEEKLY_VIEW_LABEL[item]}
            </Link>
          ))}
        </nav>

        {view === "history" ? (
          <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
            <header className="border-b p-4">
              <h2 className="flex items-center gap-2 text-xl font-bold"><History aria-hidden className="size-5" /> Historical weekly offers</h2>
              <p className="mt-1 text-sm text-muted-foreground">Expired, sealed occurrences only. These are observations, not active offers or forecasts.</p>
            </header>
            {history.length ? (
              <div className="divide-y">
                {history.map((row) => (
                  <article key={row.id} className="grid gap-2 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <p className="text-sm font-semibold">{row.startDate ? formatDateAU(row.startDate) : "Start not recorded"}–{formatDateAU(row.endDate)}</p>
                    <div><p className="font-semibold">{row.sellerName} · {row.productName}</p><p className="text-xs text-muted-foreground">Historical {row.promotionType.replaceAll("-", " ")}</p></div>
                    <p className="font-bold text-emerald-800">{historyValue(row)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <CardContent className="p-8 text-center text-sm text-muted-foreground">No approved weekly supermarket history is public yet.</CardContent>
            )}
          </section>
        ) : offers.length ? (
          <section className="mt-5 overflow-hidden rounded-2xl border bg-card" aria-label="Current weekly gift-card offers">
            {offers.map((offer) => <WeeklyOfferRow key={offer.id} offer={offer} now={now} />)}
          </section>
        ) : (
          <Card className="mt-5 border-dashed">
            <CardContent className="p-10 text-center">
              <CalendarDays aria-hidden className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">No current approved offers in this view</h2>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">New weekly offers appear only after their dates, seller, mechanic and evidence have passed manual review.</p>
              <Link href="/gift-cards" className="mt-4 inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted">Browse all current gift-card offers <ArrowRight aria-hidden className="size-4" /></Link>
            </CardContent>
          </Card>
        )}

        <section className="mt-6 flex gap-3 rounded-2xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <p><strong className="text-foreground">Trust order:</strong> retailer catalogue or promotion page first, specialist discovery source second, independent corroboration third, then DealStack’s review state. Unknown fields stay labelled as unknown.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
