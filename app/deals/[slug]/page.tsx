import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Layers, Store as StoreIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JsonLd } from "@/components/JsonLd";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import {
  CitationLinks,
  ConfidencePill,
  ExpiryLine,
} from "@/components/WeeklyDealCard";
import { siteUrl } from "@/lib/env";
import {
  dealIdFromSlug,
  weeklyDealPath,
  weeklyDealSlug,
} from "@/lib/offers/dealSlug";
import { isExpiringSoonAU, isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { resolveComponentLabels } from "@/lib/offers/weeklyPicks";
import { getStores } from "@/lib/repos";
import { getWeeklyDealById } from "@/lib/repos/weeklyDeals";
import { loadStackData } from "@/lib/stack/loadStack";
import { buildDealBreadcrumbJsonLd } from "@/lib/structuredData";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * Deal detail page — the permalink for one admin-curated weekly deal.
 * Canonical URL is /deals/{title-slug}--{id}; a bare id or a stale title slug
 * permanently redirects to the canonical form, so shared links survive title
 * edits. Expired deals stay reachable and render an explicit expired state
 * instead of 404ing inbound links.
 */

export const revalidate = 300;

interface DealPageParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: DealPageParams): Promise<Metadata> {
  const { slug } = await params;
  const deal = await getWeeklyDealById(dealIdFromSlug(decodeURIComponent(slug)));
  if (!deal) return { title: "Deal not found | DealStack AU" };
  return {
    title: `${deal.title} | DealStack AU`,
    description: deal.summary,
    alternates: { canonical: weeklyDealPath(deal) },
  };
}

export default async function DealDetailPage({ params }: DealPageParams) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const deal = await getWeeklyDealById(dealIdFromSlug(decoded));
  if (!deal) notFound();

  // Canonicalise: bare ids and outdated title slugs 308 to the current URL.
  const canonicalSlug = weeklyDealSlug(deal);
  if (decoded !== canonicalSlug) permanentRedirect(weeklyDealPath(deal));

  const [data, stores] = await Promise.all([loadStackData(), getStores()]);
  const store = stores.find((s) => s.id === deal.merchantId) ?? null;
  const componentLabels = resolveComponentLabels(deal.componentIds, {
    giftCards: data.giftCardOffers,
    cashback: data.cashbackOffers,
    points: data.pointsOffers,
  });

  const expired =
    deal.confidence === "expired-unknown" ||
    isPastExpiry(deal.expiryDate, todayAU());
  const path = weeklyDealPath(deal);

  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <JsonLd
          data={buildDealBreadcrumbJsonLd(siteUrl(), {
            title: deal.title,
            path,
          })}
        />

      <Link
        href="/deals"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All weekly deals
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Weekly deal</Badge>
        <Badge variant="outline" className="text-muted-foreground">
          Week of {formatDateAU(deal.weekOf)}
        </Badge>
        <ConfidencePill confidence={deal.confidence} className="ml-auto" />
      </div>

      <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
        {deal.title}
      </h1>

      {store ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <StoreIcon className="size-4" />
          at{" "}
          <Link
            href={`/stores/${store.id}`}
            className="font-medium text-primary hover:underline"
          >
            {store.name}
          </Link>
        </p>
      ) : null}

      {expired ? (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
          This deal has ended. Details below are kept for reference — check the
          sources or the store page for current offers.
        </div>
      ) : null}

      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        {deal.summary}
      </p>

      {componentLabels.length > 0 ? (
        <Card className="mt-6">
          <CardContent className="p-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
              <Layers className="size-4 text-emerald-600 dark:text-emerald-400" />
              What this stack combines
            </h2>
            <ul className="mt-3 space-y-2">
              {componentLabels.map((label) => (
                <li
                  key={label}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4">
        <ExpiryLine
          expiryDate={deal.expiryDate}
          expiringSoon={isExpiringSoonAU(deal.expiryDate)}
          expired={expired}
        />
        <CitationLinks citations={deal.citations} />
      </div>

      {store ? (
        <div className="mt-6">
          <Button asChild>
            <Link href={`/stores/${store.id}`}>
              See all {store.name} offers
            </Link>
          </Button>
        </div>
      ) : null}

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground/80">
        DealStack AU is a research tool, not financial advice. Offers change
        quickly — always verify terms, rates and expiry dates at the linked
        sources before purchasing.
      </p>
      </main>
      <SiteFooter />
    </div>
  );
}
