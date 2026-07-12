import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgePercent,
  Clock,
  CreditCard,
  FileSearch,
  Gift,
  ShieldCheck,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DealStackCalculator from "@/components/DealStackCalculator";
import { JsonLd } from "@/components/JsonLd";
import SiteHeader from "@/components/SiteHeader";
import SourceResultCard from "@/components/SourceResultCard";
import StoreLogo from "@/components/StoreLogo";
import SiteFooter from "@/components/SiteFooter";
import { providerBadgeClasses, SAMPLE_SPEND } from "@/components/StoreCard";
import { calculateStack, formatAUD } from "@/lib/calculateStack";
import { formatExpiry, type Store } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { getStores } from "@/lib/repos";
import { storeSourceResults } from "@/lib/repos/sourceResults";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";
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

function buildSteps(store: Store) {
  const steps: { title: string; description: string }[] = [];
  if (store.cashbackPercent > 0) {
    steps.push({
      title: `Start at ${store.cashbackProvider}`,
      description: `Open the ${store.cashbackProvider} app or site and click through to ${store.name} so your ${store.cashbackPercent}% cashback tracks.`,
    });
  }
  if (store.giftCardDiscountPercent > 0) {
    steps.push({
      title: "Buy discounted gift cards",
      description: `Grab ${store.name} gift cards at ${store.giftCardDiscountPercent}% off via ${store.giftCardSource} — buy enough to cover your expected checkout total.`,
    });
  }
  if (store.discountPercent > 0) {
    steps.push({
      title: "Apply the discount code",
      description: `Enter ${store.discountCode} at checkout for ${store.discountPercent}% off.`,
    });
  } else {
    steps.push({
      title: "Check current promotions",
      description: `${store.name} has ${store.discountCode.toLowerCase()} — watch for sale events instead.`,
    });
  }
  if (store.pointsProgram !== "—") {
    steps.push({
      title: `Scan ${store.pointsProgram}`,
      description: `Add your ${store.pointsProgram} membership at checkout to earn ${store.pointsRate.toLowerCase()} on top of everything else.`,
    });
  }
  steps.push({
    title: "Pay with your gift cards",
    description:
      store.giftCardDiscountPercent > 0
        ? "Pay the discounted total with the gift cards you bought below face value."
        : "Pay as usual — then wait for your cashback to confirm.",
  });
  return steps;
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

  const stack = calculateStack({
    originalPrice: SAMPLE_SPEND,
    discountPercent: store.discountPercent,
    cashbackPercent: store.cashbackPercent,
    giftCardDiscountPercent: store.giftCardDiscountPercent,
  });
  const steps = buildSteps(store);
  // Source checks come from the repository layer (Supabase published/approved
  // rows when configured, static sample pipeline otherwise).
  const sourceResults = await storeSourceResults(store.id);
  const recommendations = buildStackRecommendations(undefined, 500, data);

  const layers = [
    {
      icon: BadgePercent,
      label: "Discount code",
      value:
        store.discountPercent > 0 ? `${store.discountPercent}% off` : "None",
      detail:
        store.discountPercent > 0
          ? `Code: ${store.discountCode}`
          : store.discountCode,
      sub: formatExpiry(store.expiryDate),
      accent: "bg-primary/10 text-primary",
      active: store.discountPercent > 0,
      badge: null as string | null,
    },
    {
      icon: CreditCard,
      label: "Cashback",
      value:
        store.cashbackPercent > 0 ? `${store.cashbackPercent}% back` : "None",
      detail:
        store.cashbackPercent > 0
          ? "Track your click-through"
          : "No tracked cashback for this store",
      sub: null as string | null,
      accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      active: store.cashbackPercent > 0,
      badge: store.cashbackPercent > 0 ? store.cashbackProvider : null,
    },
    {
      icon: Gift,
      label: "Gift cards",
      value:
        store.giftCardDiscountPercent > 0
          ? `${store.giftCardDiscountPercent}% off`
          : "None",
      detail: store.giftCardSource,
      sub: null as string | null,
      accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      active: store.giftCardDiscountPercent > 0,
      badge: null as string | null,
    },
    {
      icon: Star,
      label: "Points",
      value: store.pointsProgram !== "—" ? store.pointsProgram : "None",
      detail: store.pointsRate,
      sub: null as string | null,
      accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      active: store.pointsProgram !== "—",
      badge: null as string | null,
    },
  ];

  return (
    <>
      {/* Breadcrumb JSON-LD (Home → store). Only rendered for a real store —
          this is after the notFound() guard — so it never describes a 404. */}
      <JsonLd data={buildStoreBreadcrumbJsonLd(siteUrl(), store)} />
      <div className="min-h-screen bg-emerald-500/[0.04]">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to stores
        </Link>

        {/* Store hero: identity + best stack estimate in one panel */}
        <div className="mt-3 rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 shadow-sm sm:p-5">
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
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-background px-4 py-3 shadow-sm sm:min-w-56 sm:text-right">
              <p className="text-xs text-muted-foreground">
                Best stack estimate
              </p>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                ~{stack.totalSavingPercent}% off
              </p>
              <p className="text-xs text-muted-foreground">
                e.g. pay{" "}
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatAUD(stack.finalEffectivePrice)}
                </span>{" "}
                effective on a {formatAUD(SAMPLE_SPEND)} purchase
              </p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            Results sourced from OzBargain, Point Hacks,
            FreePoints, GCDB and DealStack-verified entries.
          </p>
        </div>

        {/* Savings layers */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {layers.map((layer) => (
            <Card
              key={layer.label}
              className={cn(
                "gap-0 py-0 shadow-sm",
                !layer.active && "opacity-60"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        layer.accent
                      )}
                    >
                      <layer.icon className="size-4" />
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {layer.label}
                    </span>
                  </div>
                  {layer.badge && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 px-1.5 py-0 text-[10px]",
                        providerBadgeClasses[layer.badge]
                      )}
                    >
                      {layer.badge}
                    </Badge>
                  )}
                </div>
                <p className="mt-3 font-bold">{layer.value}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {layer.detail}
                </p>
                {layer.sub && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    {layer.sub}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

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

          {sourceResults.length === 0 ? (
            <Card className="mt-3 shadow-sm">
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <FileSearch className="size-8 text-muted-foreground" />
                <p className="font-medium">
                  No source listings for {store.name} right now
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  The deal stack estimates above are based on our curated data —
                  check back as sources update.
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
            Deal listings are sourced from community feeds and manual curation.
            Rates and availability change frequently — always verify directly
            with the retailer or provider before purchasing.
          </p>
        </section>

        {/* Stacking instructions */}
        <Card className="mt-6 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">
              How to stack at {store.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {i + 1}
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
          card discount, points rate and expiry date shown for {store.name} are
          manually curated and served from a cache — offers change or expire
          without notice, so they may be out of date. Always verify current
          offers directly with {store.name} and providers such as ShopBack and
          TopCashback before purchasing. DealStack AU is not affiliated with
          any retailer or rewards program listed.
        </p>
      </main>
      <SiteFooter />
      </div>
    </>
  );
}
