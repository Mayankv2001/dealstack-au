import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileSearch, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DealStackCalculator from "@/components/DealStackCalculator";
import { JsonLd } from "@/components/JsonLd";
import SiteHeader from "@/components/SiteHeader";
import SourceResultCard from "@/components/SourceResultCard";
import StoreLogo from "@/components/StoreLogo";
import SiteFooter from "@/components/SiteFooter";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import { SAMPLE_SPEND } from "@/components/StoreCard";
import { formatAUD } from "@/lib/calculateStack";
import { siteUrl } from "@/lib/env";
import { publicFreshness } from "@/lib/freshness";
import { getStores } from "@/lib/repos";
import { storeSourceResults } from "@/lib/repos/sourceResults";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";
import {
  buildStackSteps,
  recommendationPresentation,
} from "@/lib/stack/present";
import { buildStoreBreadcrumbJsonLd } from "@/lib/structuredData";
import { cn } from "@/lib/utils";

// ISR: serve cached HTML and refresh stores from the DB periodically, matching
// the home, search and /deals routes. getStores() falls back to static data when
// Supabase is unconfigured or unavailable, so every store page still renders.
export const revalidate = 300;

// Pre-render one page per trusted store. In live-data mode getStores() fails
// closed to an empty list when the database is unavailable; dynamicParams keeps
// valid store slugs routable once the database recovers.
export async function generateStaticParams() {
  const stores = await getStores();
  return stores.map((store) => ({ slug: store.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const stores = await getStores();
  const store = stores.find((s) => s.id === slug);
  return {
    title: store
      ? `${store.name} deal stack — DealStack AU`
      : "Store not found — DealStack AU",
  };
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadStackData();
  const stores = data.stores;
  const store = stores.find((s) => s.id === slug);
  if (!store) notFound();

  // Source checks come from the repository layer (Supabase published/approved
  // rows when configured, static sample pipeline otherwise).
  const sourceResults = await storeSourceResults(store.id);
  const now = new Date();
  const recommendations = buildStackRecommendations(undefined, 500, data, now);
  // The hero estimate and how-to steps come from the SAME engine output as the
  // Decision Hub, homepage and calculator — never from naively compounding the
  // store's recorded rates (which ignored gift-card/cashback exclusions).
  const recommendation =
    recommendations.find((rec) => rec.merchantId === store.id) ?? null;
  const steps = buildStackSteps(store.name, recommendation);
  const presentation = recommendationPresentation(recommendation);
  const freshness = publicFreshness(recommendation?.checkedAsOf, now);

  return (
    <>
      {/* Breadcrumb JSON-LD (Home → store). Only rendered for a real store —
          this is after the notFound() guard — so it never describes a 404. */}
      <JsonLd data={buildStoreBreadcrumbJsonLd(siteUrl(), store)} />
      <div className="min-h-screen bg-emerald-500/[0.04]">
        <SiteHeader />

        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <Link
            href="/stores"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to stores
          </Link>

          {/* Store hero: identity + best stack estimate in one panel */}
          <div className="mt-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StoreLogo store={store} size="lg" />
                <div>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {store.name}
                  </h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {store.category}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
                    <span>
                      Verified layers shown: {presentation.verifiedLayerCount}{" "}
                      of {presentation.includedLayerCount}
                    </span>
                    <span>
                      Freshness: {freshness.label}
                      {freshness.checkedDate
                        ? ` · checked ${freshness.checkedDate}`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/25 bg-background px-4 py-3 shadow-sm sm:min-w-56 sm:text-right">
                <p className="text-xs text-muted-foreground">
                  {presentation.planLabel}
                </p>
                {recommendation && recommendation.totalSaving > 0 ? (
                  <>
                    <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                      ~{recommendation.effectiveDiscountPercent}% off
                    </p>
                    <p className="text-xs text-muted-foreground">
                      e.g. pay{" "}
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatAUD(recommendation.effectivePrice)}
                      </span>{" "}
                      effective on a {formatAUD(SAMPLE_SPEND)} purchase —
                      compatible layers only
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold tracking-tight">
                      {recommendation?.kind === "points-only"
                        ? "Points only"
                        : presentation.recommendationLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recommendation?.kind === "points-only"
                        ? "Rewards are shown separately; the cash price is unchanged."
                        : "The rates below are individual layers, not a combined saving."}
                    </p>
                  </>
                )}
              </div>
            </div>
            <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Results sourced from OzBargain, Point Hacks, FreePoints, GCDB and
              DealStack records.
            </p>
            <Link
              href={`/search?q=${encodeURIComponent(store.name)}&spend=${SAMPLE_SPEND}`}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800"
            >
              Plan a {store.name} purchase{" "}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>

          {recommendation ? (
            <section className="mt-6" aria-labelledby="store-plan-breakdown">
              <h2
                id="store-plan-breakdown"
                className="text-lg font-bold tracking-tight sm:text-xl"
              >
                Recommended plan and excluded layers
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Included layers and available alternatives come from the same
                engine result used by the planner and calculator.
              </p>
              <div className="mt-3 max-w-3xl">
                <StackRecommendationCard
                  recommendation={recommendation}
                  stores={stores}
                  now={now}
                />
              </div>
            </section>
          ) : null}

          {/* Source checks (Supabase-backed when configured; static demo pool otherwise — no live fetching) */}
          <section className="mt-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">
                Source checks for this store
              </h2>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {sourceResults.length === 0
                ? `What OzBargain, Point Hacks, FreePoints and GCDB list for ${store.name}`
                : `${sourceResults.length} ${sourceResults.length === 1 ? "listing" : "listings"} mentioning ${store.name} across our checked sources`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              These are informational source listings, not layers included by
              the recommendation engine unless they appear in the plan above.
            </p>

            {sourceResults.length === 0 ? (
              <Card className="mt-3 shadow-sm">
                <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                  <FileSearch className="size-8 text-muted-foreground" />
                  <p className="font-medium">
                    No source listings for {store.name} right now
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    The deal stack estimates above are based on our curated data
                    — check back as sources update.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sourceResults.map((result) => (
                  <SourceResultCard key={result.id} result={result} />
                ))}
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Deal listings are sourced from community feeds and manual
              curation. Rates and availability change frequently — always verify
              directly with the retailer or provider before purchasing.
            </p>
          </section>

          {/* Stacking instructions */}
          <Card className="mt-6 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                {presentation.planLabel} for {store.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {steps.map((step, i) => (
                  <li key={`${i}-${step.title}`} className="flex gap-3">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold",
                        step.chooseOne
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {step.chooseOne ? "!" : i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold leading-6">
                        {step.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Calculator */}
          <section className="mt-6 flex flex-col items-center">
            <div className="mb-4 text-center">
              <h2 className="text-xl font-bold tracking-tight">
                Run your own numbers
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Pick {store.name} below to prefill its rates, then enter your
                purchase price.
              </p>
            </div>
            <DealStackCalculator
              recommendations={recommendations}
              initialStoreId={store.id}
            />
          </section>

          {/* Disclaimer */}
          <p className="mt-6 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
            <strong>Disclaimer:</strong> The discount code, cashback rate, gift
            card discount, points rate and expiry date shown for {store.name}{" "}
            are manually curated and served from a cache — offers change or
            expire without notice, so they may be out of date. Always verify
            current offers directly with {store.name} and providers such as
            ShopBack and TopCashback before purchasing. DealStack AU is not
            affiliated with any retailer or rewards program listed.
          </p>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
