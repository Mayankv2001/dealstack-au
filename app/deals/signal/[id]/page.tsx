import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Layers3,
  MessageSquare,
  Tag,
} from "lucide-react";
import { DealCard } from "@/components/deals/DealCard";
import { DealFreshness } from "@/components/deals/DealFreshness";
import {
  DealConditionBadges,
  DealStatusBadge,
} from "@/components/deals/DealStatusBadge";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import StoreLogo from "@/components/StoreLogo";
import { Button } from "@/components/ui/button";
import { loadDealsBundle } from "@/lib/deals/load";
import { filterActive } from "@/lib/deals/query";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";

export const revalidate = 300;

interface SignalPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: SignalPageProps): Promise<Metadata> {
  const { id } = await params;
  const bundle = await loadDealsBundle();
  const deal = bundle.deals.find(
    (candidate) => candidate.id === `community:${id}`,
  );
  return deal
    ? { title: `${deal.title} | DealStack AU`, description: deal.summary }
    : { title: "Deal not found | DealStack AU" };
}

export default async function SignalDealPage({ params }: SignalPageProps) {
  const { id } = await params;
  const now = new Date();
  const bundle = await loadDealsBundle(now);
  const deal = filterActive(bundle.deals, now).find(
    (candidate) => candidate.id === `community:${id}`,
  );
  if (!deal) notFound();
  const store = deal.merchantId
    ? bundle.stores.find((candidate) => candidate.id === deal.merchantId)
    : undefined;
  const source = deal.sourceUrl ? safePublicSourceUrl(deal.sourceUrl) : null;
  const related = filterActive(bundle.deals, now)
    .filter(
      (candidate) =>
        candidate.id !== deal.id &&
        candidate.merchantId &&
        candidate.merchantId === deal.merchantId,
    )
    .slice(0, 3);
  const stack = deal.merchantId
    ? bundle.stackRecommendations.find(
        (candidate) => candidate.merchantId === deal.merchantId,
      )
    : null;
  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.035]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <Link
          href="/deals?kind=community"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" /> Community deals
        </Link>
        <article className="mt-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <StoreLogo
              store={store}
              text={deal.merchantName?.slice(0, 2).toUpperCase() ?? "OZ"}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-muted-foreground">
                {deal.merchantName ?? "Community source"}
              </p>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {deal.title}
              </h1>
            </div>
            <DealStatusBadge
              trust={deal.trust}
              dealStackVerified={deal.dealStackVerified}
              className="hidden sm:inline-flex"
            />
          </div>
          <div className="mt-4 sm:hidden">
            <DealStatusBadge
              trust={deal.trust}
              dealStackVerified={deal.dealStackVerified}
            />
          </div>
          {deal.priceText ? (
            <p className="mt-5 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {deal.priceText}
            </p>
          ) : (
            <p className="mt-5 text-sm font-semibold text-muted-foreground">
              Price not supplied — verify at the source
            </p>
          )}
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {deal.summary ||
              "No public summary is available. Check the original source before purchasing."}
          </p>
          {deal.couponCode ? (
            <div className="mt-5 rounded-lg border border-dashed bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                Community-posted coupon
              </p>
              <code className="mt-1 block text-lg font-bold">
                {deal.couponCode}
              </code>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {deal.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
              >
                <Tag aria-hidden className="size-3" />
                {tag}
              </span>
            ))}
          </div>
          <DealConditionBadges deal={deal} now={now} className="mt-4" />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-4">
            <DealFreshness deal={deal} now={now} />
            {deal.comments != null ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare aria-hidden className="size-3.5" />{" "}
                {deal.comments} comments at source
              </span>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {source ? (
              <Button asChild>
                <a
                  href={source}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                >
                  View original source <ExternalLink aria-hidden />
                </a>
              </Button>
            ) : (
              <Button disabled>Source unavailable</Button>
            )}
            {deal.merchantId ? (
              <Button asChild variant="outline">
                <Link href={`/stores/${deal.merchantId}`}>
                  See merchant offers
                </Link>
              </Button>
            ) : null}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Community reported means the record passed the publication gate; it
            does not mean DealStack independently verified the price or terms.
            Check the destination before paying.
          </p>
        </article>
        {stack ? (
          <section className="mt-8 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Layers3 aria-hidden className="size-5" /> Stack opportunity
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Compatible layers may be available for this merchant. The
              calculated stack is shown on the main Deals page.
            </p>
            <Button asChild variant="outline" className="mt-3 bg-background">
              <Link href="/deals?view=stacks">View best stacks</Link>
            </Button>
          </section>
        ) : null}
        {related.length ? (
          <section className="mt-9">
            <h2 className="text-xl font-bold">Related active offers</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {related.map((item) => (
                <DealCard
                  key={item.id}
                  deal={item}
                  stores={bundle.stores}
                  now={now}
                  compact
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
