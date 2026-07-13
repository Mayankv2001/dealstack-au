import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Compass,
  ExternalLink,
  Gift,
  SearchX,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { DealCard } from "@/components/deals/DealCard";
import GiftCardOfferCard from "@/components/GiftCardOfferCard";
import SearchBar from "@/components/SearchBar";
import ReportProblemForm from "@/components/ReportProblemForm";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import SmartStackComparisonCard from "@/components/SmartStackComparisonCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatAUD } from "@/lib/calculateStack";
import { loadDecisionResult } from "@/lib/decision/loadDecisionResult";
import type { DecisionTarget } from "@/lib/decision/types";
import { formatDateAU } from "@/lib/sources/normalise";

type RawSearchParams = {
  q?: string | string[];
  spend?: string | string[];
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function parseSpend(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100_000
    ? parsed
    : 500;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const query = first(params.q)?.trim() ?? "";
  return {
    title: query
      ? `Purchase plan for “${query}” | DealStack AU`
      : "Plan a purchase | DealStack AU",
    description:
      "Find a verified cash stack, separate rewards estimate, compatible gift cards, conditions and source freshness for an Australian purchase.",
  };
}

export const revalidate = 300;

function targetHref(target: DecisionTarget, spend: number): string {
  return `/search?q=${encodeURIComponent(target.name)}&spend=${spend}`;
}

function TargetChoices({
  title,
  targets,
  spend,
}: {
  title: string;
  targets: DecisionTarget[];
  spend: number;
}) {
  if (targets.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {targets.map((target) => (
          <Link
            key={`${target.kind}:${target.id}`}
            href={targetHref(target, spend)}
            className="rounded-xl border bg-background px-3 py-2 text-sm hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"
          >
            <span className="font-semibold">{target.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {target.description}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const query = first(params.q)?.trim() ?? "";
  const spend = parseSpend(first(params.spend));
  const result = await loadDecisionResult(query, spend);
  const now = new Date();
  const noResults =
    query.length > 0 &&
    !result.selectedTarget &&
    !result.ambiguous &&
    !result.bestCashStack &&
    !result.rewardsStack &&
    result.currentGiftCardOffers.length === 0 &&
    result.communityPulse.length === 0 &&
    result.productComparisons.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Purchase decision hub
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {query ? `Best verified way to pay for “${query}”` : "What are you planning to buy?"}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Cash savings, points, compatible cards, conditions and community
            activity are shown separately so popularity never masquerades as verification.
          </p>
          <SearchBar
            defaultValue={query}
            defaultSpend={spend}
            showSpend
            size="lg"
            layout="split"
            className="mx-auto mt-6 max-w-3xl text-left"
            placeholder="Store, gift card, product or rewards programme"
            buttonLabel="Build plan"
          />
        </div>

        {result.partial ? (
          <p role="status" className="mx-auto mt-5 max-w-3xl rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            Some published sources are temporarily unavailable. The plan below is partial.
          </p>
        ) : null}

        {result.ambiguous ? (
          <Card className="mx-auto mt-8 max-w-4xl">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-start gap-3">
                <Compass aria-hidden className="mt-0.5 size-5 text-emerald-600" />
                <div>
                  <h2 className="font-semibold">Choose what you meant</h2>
                  <p className="text-sm text-muted-foreground">
                    Several reviewed entities match. DealStack will not silently guess.
                  </p>
                </div>
              </div>
              <TargetChoices title="Stores" targets={result.targetGroups.stores} spend={spend} />
              <TargetChoices title="Gift cards" targets={result.targetGroups.giftCards} spend={spend} />
              <TargetChoices title="Rewards programmes" targets={result.targetGroups.programmes} spend={spend} />
            </CardContent>
          </Card>
        ) : null}

        {result.productComparisons.length > 0 ? (
          <section className="mt-10" aria-labelledby="retailer-comparison">
            <h2 id="retailer-comparison" className="text-xl font-bold">
              Compare current retailers
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Same-product listings are grouped only by an approved canonical product key.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {result.productComparisons.map((comparison) => (
                <SmartStackComparisonCard
                  key={comparison.productGroup}
                  comparison={comparison}
                  stores={result.stores}
                />
              ))}
            </div>
          </section>
        ) : null}

        {noResults ? (
          <Card className="mx-auto mt-8 max-w-2xl">
            <CardContent className="flex flex-col items-center py-10 text-center">
              <SearchX aria-hidden className="size-8 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">No reviewed match yet</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Try a retailer such as Myer or JB Hi-Fi, a card brand such as Apple,
                or a programme such as Flybuys. New reviewed records appear after approval.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {!result.ambiguous && (result.bestCashStack || result.rewardsStack) ? (
          <section className="mt-10" aria-labelledby="purchase-plan">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {result.selectedTarget?.name ?? "Matched purchase"}
                </p>
                <h2 id="purchase-plan" className="mt-1 text-2xl font-bold">
                  Your {formatAUD(spend)} purchase plan
                </h2>
              </div>
              <details className="max-w-xl rounded-xl border bg-background p-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-semibold text-foreground">
                  Why this ranks first
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  {result.rankingExplanation.map((reason) => <li key={reason}>{reason}</li>)}
                </ol>
              </details>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {result.bestCashStack ? (
                <StackRecommendationCard recommendation={result.bestCashStack} stores={result.stores} />
              ) : (
                <Card><CardContent className="p-5"><p className="font-semibold">No verified cash reduction recorded</p><p className="mt-1 text-sm text-muted-foreground">The cash price remains {formatAUD(spend)} before any separately shown rewards.</p></CardContent></Card>
              )}
              {result.rewardsStack && result.rewardsStack !== result.bestCashStack ? (
                <StackRecommendationCard recommendation={result.rewardsStack} stores={result.stores} />
              ) : (
                <Card><CardContent className="p-5"><div className="flex items-center gap-2"><Sparkles aria-hidden className="size-5 text-amber-500" /><h3 className="font-semibold">Rewards kept separate</h3></div><p className="mt-2 text-sm text-muted-foreground">No distinct points opportunity is recorded for this match. Estimated rewards never reduce the headline cash price.</p></CardContent></Card>
              )}
            </div>
          </section>
        ) : null}

        {result.warnings.length > 0 && !result.ambiguous ? (
          <section className="mt-8 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4" aria-labelledby="plan-warnings">
            <h2 id="plan-warnings" className="flex items-center gap-2 font-semibold"><AlertTriangle aria-hidden className="size-4 text-amber-600" /> Conditions to check</h2>
            <ul className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {result.warnings.slice(0, 8).map((warning) => <li key={warning}>• {warning}</li>)}
            </ul>
          </section>
        ) : null}

        {result.currentGiftCardOffers.length > 0 && !result.ambiguous ? (
          <section className="mt-10" aria-labelledby="current-gift-cards">
            <div className="flex items-center gap-2"><Gift aria-hidden className="size-5 text-violet-600" /><h2 id="current-gift-cards" className="text-xl font-bold">Current reviewed gift-card offers</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.currentGiftCardOffers.map((offer) => <GiftCardOfferCard key={offer.id} offer={offer} now={now} />)}
            </div>
          </section>
        ) : null}

        {result.acceptedCards.length > 0 && !result.ambiguous ? (
          <section className="mt-10" aria-labelledby="accepted-cards">
            <div className="flex items-center gap-2"><Store aria-hidden className="size-5 text-emerald-600" /><h2 id="accepted-cards" className="text-xl font-bold">Card acceptance evidence</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.acceptedCards.slice(0, 9).map(({ product, acceptance }) => (
                <Card key={acceptance.id}><CardContent className="p-4"><h3 className="font-semibold">{product.brand}</h3><p className="mt-1 text-sm text-muted-foreground">{acceptance.merchantName ?? acceptance.merchantCategory ?? "Published merchant record"}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className={acceptance.outcome === "unsuccessful" ? "rounded-full bg-red-500/10 px-2 py-1 font-semibold text-red-700" : acceptance.status === "verified" ? "rounded-full bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-700" : "rounded-full bg-muted px-2 py-1 font-semibold text-muted-foreground"}>{acceptance.outcome === "unsuccessful" ? "Known unsuccessful" : acceptance.status === "verified" ? "Verified by DealStack" : acceptance.status === "claimed" ? "Claimed by issuer" : "Community reported"}</span>{acceptance.checkedAt ? <span className="text-muted-foreground">Checked {formatDateAU(acceptance.checkedAt.slice(0, 10))}</span> : null}</div><ReportProblemForm entityType="gift-card-acceptance" entityId={acceptance.id} compact /></CardContent></Card>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Not recorded never means not accepted. Merchant category coding and terminal routing can affect redemption.</p>
          </section>
        ) : null}

        {result.communityPulse.length > 0 && !result.ambiguous ? (
          <section className="mt-10" aria-labelledby="community-pulse">
            <div className="flex items-center gap-2"><ExternalLink aria-hidden className="size-5 text-orange-600" /><h2 id="community-pulse" className="text-xl font-bold">Community pulse</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Approved activity summaries link to the original discussion. Votes and comments are ranking tie-breakers, not DealStack verification.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {result.communityPulse.map((deal) => <DealCard key={deal.id} deal={deal} stores={result.stores} now={now} compact />)}
            </div>
          </section>
        ) : null}

        {!result.ambiguous && (result.freshness.sourceLinkCount > 0 || result.freshness.oldestVerificationDate) ? (
          <section className="mt-10 grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-3" aria-label="Plan trust summary">
            <div className="flex items-start gap-2"><ShieldCheck aria-hidden className="mt-0.5 size-4 text-emerald-600" /><div><p className="font-semibold">{result.freshness.sourceFamilyCount} publisher {result.freshness.sourceFamilyCount === 1 ? "family" : "families"}</p><p className="text-xs text-muted-foreground">Corroboration is deduplicated by publisher ownership.</p></div></div>
            <div className="flex items-start gap-2"><CheckCircle2 aria-hidden className="mt-0.5 size-4 text-emerald-600" /><div><p className="font-semibold">{result.freshness.sourceLinkCount} traceable links</p><p className="text-xs text-muted-foreground">Multiple links from one family remain useful, but not independent.</p></div></div>
            <div className="flex items-start gap-2"><Clock3 aria-hidden className="mt-0.5 size-4 text-emerald-600" /><div><p className="font-semibold">{result.freshness.oldestVerificationDate ? `Oldest check ${formatDateAU(result.freshness.oldestVerificationDate.slice(0, 10))}` : "Check date unavailable"}</p><p className="text-xs text-muted-foreground">The oldest contributing verification date is shown conservatively.</p></div></div>
          </section>
        ) : null}

        {result.alternativeStacks.length > 0 && !result.ambiguous ? (
          <section className="mt-10"><h2 className="text-xl font-bold">Alternative combinations</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{result.alternativeStacks.map((stack) => <StackRecommendationCard key={stack.merchantId} recommendation={stack} stores={result.stores} />)}</div></section>
        ) : null}

        {!query ? (
          <div className="mx-auto mt-10 max-w-2xl text-center"><p className="text-sm text-muted-foreground">Start with a store, product, gift-card brand or rewards programme.</p><Button asChild variant="outline" className="mt-4"><Link href="/deals">Browse Discover <ArrowRight aria-hidden /></Link></Button></div>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
