"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CreditCard,
  Flame,
  Gift,
  Layers,
  SearchX,
  Sparkles,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import WeeklyDealCard, {
  type WeeklyDealCardData,
} from "@/components/WeeklyDealCard";
import { stores } from "@/lib/data";
import {
  cashbackOffers,
  giftCardOffers,
  ozBargainSignals,
  pointsOffers,
} from "@/lib/offers/manualOffers";
import type { StackRecommendation } from "@/lib/offers/types";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { cn } from "@/lib/utils";

/**
 * Interactive client for the Weekly Deals page.
 *
 * Holds all filter state so the GCDB/FreePoints-style pills actually filter the
 * layer feeds. Rendered by the server component app/deals/page.tsx (which owns
 * the route metadata). All data is static/manual (lib/offers/manualOffers.ts)
 * and the pure stack engine (lib/stack/buildStack.ts) — no network, no database.
 */

const WEEK_LABEL = "Week of 8 June 2026";
/** Mirrors the engine's fixed sample "now". 7-day expiring-soon window. */
const SAMPLE_NOW = new Date("2026-06-13T12:00:00+10:00");
const EXPIRY_SOON_MS = 7 * 24 * 60 * 60 * 1000;

type FilterId =
  | "all"
  | "best-stacks"
  | "gift-cards"
  | "points"
  | "cashback"
  | "signals"
  | "expiring-soon"
  | "qantas"
  | "velocity"
  | "everyday-rewards"
  | "flybuys";

const LAYER_FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "best-stacks", label: "Best stacks" },
  { id: "gift-cards", label: "Gift cards" },
  { id: "points", label: "Points" },
  { id: "cashback", label: "Cashback" },
  { id: "signals", label: "OzBargain signals" },
  { id: "expiring-soon", label: "Expiring soon" },
];

const PROGRAM_FILTERS: { id: FilterId; label: string }[] = [
  { id: "qantas", label: "Qantas" },
  { id: "velocity", label: "Velocity" },
  { id: "everyday-rewards", label: "Everyday Rewards" },
  { id: "flybuys", label: "Flybuys" },
];

const FILTER_LABEL: Record<FilterId, string> = Object.fromEntries(
  [...LAYER_FILTERS, ...PROGRAM_FILTERS].map((f) => [f.id, f.label])
) as Record<FilterId, string>;

interface TaggedDeal {
  tags: Set<FilterId>;
  data: WeeklyDealCardData;
}

const storeName = (id: string | null): string | null =>
  id ? (stores.find((s) => s.id === id)?.name ?? null) : null;

function programTag(program: string | null | undefined): FilterId | null {
  const p = (program ?? "").toLowerCase();
  if (p.includes("qantas")) return "qantas";
  if (p.includes("velocity")) return "velocity";
  if (p.includes("flybuys")) return "flybuys";
  if (p.includes("everyday")) return "everyday-rewards";
  return null;
}

function isExpiringSoon(expiry: string | null): boolean {
  if (!expiry) return false;
  const diff =
    new Date(`${expiry}T23:59:59+10:00`).getTime() - SAMPLE_NOW.getTime();
  return diff >= 0 && diff <= EXPIRY_SOON_MS;
}

// ─── Static data (computed once at module load) ────────────────────────────

const recommendations = buildStackRecommendations();
const topStacks = recommendations.slice(0, 3);

const taggedStacks: { rec: StackRecommendation; tags: Set<FilterId> }[] =
  recommendations.map((rec) => {
    const tags = new Set<FilterId>();
    const text = rec.components
      .map((c) => `${c.label} ${c.note ?? ""}`)
      .join(" ")
      .toLowerCase();
    if (text.includes("qantas")) tags.add("qantas");
    if (text.includes("velocity")) tags.add("velocity");
    if (text.includes("everyday")) tags.add("everyday-rewards");
    if (text.includes("flybuys")) tags.add("flybuys");
    if (rec.warnings.some((w) => w.code === "expiry-soon"))
      tags.add("expiring-soon");
    return { rec, tags };
  });

const giftCardDeals: TaggedDeal[] = giftCardOffers.map((o): TaggedDeal => {
  const tags = new Set<FilterId>(["gift-cards"]);
  const prog = programTag(o.pointsOnPurchase?.program);
  if (prog) tags.add(prog);
  const soon = isExpiringSoon(o.expiryDate);
  if (soon) tags.add("expiring-soon");
  const acceptedAt = o.acceptedAtMerchantIds
    .map(storeName)
    .filter(Boolean)
    .join(", ");
  const summary = [
    o.discountPercent > 0
      ? `${o.discountPercent}% off ${o.brand} cards via ${o.source}.`
      : `${o.brand} cards via ${o.source}.`,
    acceptedAt ? `Spend at ${acceptedAt}.` : null,
    o.pointsOnPurchase ? `${o.pointsOnPurchase.earnNote}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const badge =
    o.discountPercent > 0
      ? { value: `${o.discountPercent}% OFF`, caption: "off face value" }
      : o.pointsOnPurchase
        ? { value: "Bonus", caption: "points on purchase" }
        : { value: "Offer" };
  return {
    tags,
    data: {
      variant: "giftcard",
      kind: "gift-card",
      category: "Gift card",
      tone: "violet",
      icon: Gift,
      title: `${o.brand} gift cards`,
      subject: o.source,
      summary,
      badge,
      expiryDate: o.expiryDate,
      expiringSoon: soon,
      lastCheckedAt: o.lastCheckedAt,
      confidence: o.confidence,
      citations: o.citations,
    },
  };
});

const pointsDeals: TaggedDeal[] = pointsOffers.map((o): TaggedDeal => {
  const tags = new Set<FilterId>(["points"]);
  const prog = programTag(o.program);
  if (prog) tags.add(prog);
  const soon = isExpiringSoon(o.expiryDate);
  if (soon) tags.add("expiring-soon");
  return {
    tags,
    data: {
      variant: "points",
      kind: "points",
      category: "Points boost",
      tone: "amber",
      program: o.program,
      title:
        o.mechanism === "in-store-boost"
          ? "Activated in-store boost"
          : "Base earn rate",
      subject: storeName(o.merchantId),
      summary:
        o.mechanism === "in-store-boost"
          ? "Sample activated offer — activate in-app before you shop to earn the bonus."
          : "Sample base earn rate on eligible spend at this merchant.",
      badge: o.earnMultiple
        ? { value: `${o.earnMultiple}×`, caption: "points" }
        : { value: o.earnRateDisplay },
      expiryDate: o.expiryDate,
      expiringSoon: soon,
      lastCheckedAt: o.lastCheckedAt,
      confidence: o.confidence,
      citations: o.citations,
    },
  };
});

const cashbackDeals: TaggedDeal[] = cashbackOffers.map((o): TaggedDeal => {
  const tags = new Set<FilterId>(["cashback"]);
  if (isExpiringSoon(o.expiryDate)) tags.add("expiring-soon");
  return {
    tags,
    data: {
      variant: "giftcard", // reuse the badge-banner layout, emerald-toned
      kind: "cashback",
      category: "Cashback",
      tone: "emerald",
      icon: CreditCard,
      title: `${o.provider} cashback`,
      subject: storeName(o.merchantId),
      summary: o.termsSummary,
      badge: {
        value: `${o.ratePercent}% BACK`,
        caption: o.isUpsized ? "upsized rate" : "cashback",
      },
      expiryDate: o.expiryDate,
      expiringSoon: isExpiringSoon(o.expiryDate),
      lastCheckedAt: o.lastCheckedAt,
      confidence: o.confidence,
      citations: o.citations,
    },
  };
});

const signalDeals: TaggedDeal[] = ozBargainSignals.map((o): TaggedDeal => {
  const tags = new Set<FilterId>(["signals"]);
  return {
    tags,
    data: {
      variant: "signal",
      kind: "discount-code",
      category: "OzBargain signal",
      tone: "orange",
      icon: Flame,
      title: o.title,
      subject: storeName(o.merchantId),
      summary: o.summary,
      votes: o.votesSample,
      postedAt: o.postedAt,
      expiryDate: null,
      lastCheckedAt: o.lastCheckedAt,
      confidence: o.confidence,
      citations: [{ source: "ozbargain", sourceUrl: o.sourceUrl }],
    },
  };
});

// ─── UI scaffolding ────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  iconClass,
  title,
  subtitle,
}: {
  icon: typeof Gift;
  iconClass: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          iconClass
        )}
      >
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

const verificationNotes = [
  "Gift card acceptance and discounts change weekly — confirm the card is accepted before buying.",
  "Most cashback offers exclude gift card payment; you usually cannot claim both on one order.",
  "Points boosts almost always need to be activated in the program app before you shop.",
];

export default function DealsClient() {
  const [active, setActive] = useState<FilterId>("all");

  const matchDeal = (d: TaggedDeal) => active === "all" || d.tags.has(active);
  const visGift = giftCardDeals.filter(matchDeal);
  const visPoints = pointsDeals.filter(matchDeal);
  const visCash = cashbackDeals.filter(matchDeal);
  const visSig = signalDeals.filter(matchDeal);

  // Full stacks appear only when a filter selects them (the compact strip
  // already represents stacks on the default "all" view).
  const visStacks =
    active === "all"
      ? []
      : taggedStacks.filter(
          ({ tags }) => active === "best-stacks" || tags.has(active)
        );

  const totalVisible =
    visStacks.length +
    visGift.length +
    visPoints.length +
    visCash.length +
    visSig.length;

  const isProgramFilter =
    active === "qantas" ||
    active === "velocity" ||
    active === "everyday-rewards" ||
    active === "flybuys";

  function Chip({ id, label }: { id: FilterId; label: string }) {
    const on = active === id;
    return (
      <button
        type="button"
        onClick={() => setActive(id)}
        aria-pressed={on}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          on
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-border bg-background text-muted-foreground hover:border-emerald-500/40 hover:text-foreground"
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link href="/">Stores</Link>
            </Button>
            <span
              aria-current="page"
              className="inline-flex h-8 items-center rounded-md bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
            >
              Deals
            </span>
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link href="/resources">Resources</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Link href="/#calculator">Calculator</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Hero */}
        <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 shadow-sm sm:p-5">
          <div className="max-w-2xl">
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              <Sparkles className="size-3" />
              {WEEK_LABEL}
            </Badge>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Weekly{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                Deals
              </span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              DealStack summarises weekly opportunities and links to the original
              sources. Always confirm offer terms before buying.
            </p>
          </div>

          {/* Single strong disclaimer near the top */}
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              These are static/manual MVP examples. Offers change quickly. Always
              verify with the original source, cashback provider, gift card
              portal, or retailer before purchasing.
            </span>
          </p>
        </div>

        {/* 1 — This week's top stacks (always visible, scannable) */}
        <section className="mt-6">
          <SectionHeading
            icon={Layers}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            title="This week's top stacks"
            subtitle="The three strongest combined stacks on a $500 example spend."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topStacks.map((rec, i) => (
              <StackRecommendationCard
                key={rec.merchantId}
                recommendation={rec}
                compact
                rank={i + 1}
              />
            ))}
          </div>
        </section>

        {/* 2 — Filter chips */}
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          {LAYER_FILTERS.map((f) => (
            <Chip key={f.id} id={f.id} label={f.label} />
          ))}
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
            Programs:
          </span>
          {PROGRAM_FILTERS.map((f) => (
            <Chip key={f.id} id={f.id} label={f.label} />
          ))}
        </div>

        {/* Empty state */}
        {totalVisible === 0 && (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border bg-card py-12 text-center shadow-sm">
            <SearchX className="size-8 text-muted-foreground" />
            <p className="font-medium">No {FILTER_LABEL[active]} this week</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {isProgramFilter
                ? "No direct offers for this program in the sample data. See Resources for conversion routes (e.g. Everyday Rewards → Qantas, Flybuys → Velocity)."
                : "Try another filter — new sample offers rotate each week."}
            </p>
            <div className="mt-1 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setActive("all")}>
                Show all
              </Button>
              {isProgramFilter && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/resources">Resources</Link>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Full stacks (when a filter selects them) */}
        {visStacks.length > 0 && (
          <section className="mt-6">
            <SectionHeading
              icon={Layers}
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              title="Stack recommendations"
              subtitle="Full breakdown of each matching stack."
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {visStacks.map(({ rec }) => (
                <StackRecommendationCard
                  key={rec.merchantId}
                  recommendation={rec}
                />
              ))}
            </div>
          </section>
        )}

        {/* Gift cards (GCDB-style) */}
        {visGift.length > 0 && (
          <section className="mt-8">
            <SectionHeading
              icon={Gift}
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              title="Weekly gift card offers"
              subtitle="Discounted cards and bonus-points promos to pre-buy your spend."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visGift.map((d, i) => (
                <WeeklyDealCard key={`gc-${i}`} data={d.data} />
              ))}
            </div>
          </section>
        )}

        {/* Points (FreePoints-style) */}
        {visPoints.length > 0 && (
          <section className="mt-8">
            <SectionHeading
              icon={Star}
              iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              title="Points boosts"
              subtitle="Activated multipliers and base earn rates worth stacking."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visPoints.map((d, i) => (
                <WeeklyDealCard key={`pts-${i}`} data={d.data} />
              ))}
            </div>
          </section>
        )}

        {/* Cashback */}
        {visCash.length > 0 && (
          <section className="mt-8">
            <SectionHeading
              icon={CreditCard}
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              title="Cashback boosts"
              subtitle="ShopBack and TopCashback rates — note gift card exclusions."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visCash.map((d, i) => (
                <WeeklyDealCard key={`cb-${i}`} data={d.data} />
              ))}
            </div>
          </section>
        )}

        {/* OzBargain signals (feed-style) */}
        {visSig.length > 0 && (
          <section className="mt-8">
            <SectionHeading
              icon={Flame}
              iconClass="bg-orange-500/10 text-orange-600 dark:text-orange-400"
              title="OzBargain deal signals"
              subtitle="Community-reported activity to corroborate before you act."
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {visSig.map((d, i) => (
                <WeeklyDealCard key={`sig-${i}`} data={d.data} />
              ))}
            </div>
          </section>
        )}

        {/* Coming soon: weekly stack alerts (static UI only) */}
        <section className="mt-10">
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Bell className="size-4.5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight">
                    Weekly stack alerts
                  </h2>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400"
                  >
                    Coming soon
                  </Badge>
                </div>
                <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                  Get the week&apos;s best stacks in your inbox. Not live yet —
                  no emails are collected.
                </p>
              </div>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <input
                type="email"
                disabled
                placeholder="you@example.com"
                aria-label="Email (coming soon)"
                className="h-9 w-full rounded-md border bg-background/60 px-3 text-sm text-muted-foreground sm:w-56"
              />
              <Button size="sm" disabled className="shrink-0">
                Notify me
              </Button>
            </div>
          </div>
        </section>

        {/* Verification notes + single bottom disclaimer */}
        <section className="mt-8">
          <SectionHeading
            icon={AlertTriangle}
            iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            title="Before you buy"
            subtitle="A few things that trip up stackers."
          />
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 shadow-sm sm:p-5">
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-3">
              {verificationNotes.map((note) => (
                <li key={note} className="flex gap-2 text-xs leading-relaxed">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="text-muted-foreground">{note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-amber-500/20 pt-3 text-xs leading-relaxed text-muted-foreground">
              <strong>Disclaimer:</strong> These are static/manual MVP examples.
              Offers change quickly. Always verify with the original source,
              cashback provider, gift card portal, or retailer before purchasing.
              DealStack AU is not affiliated with any retailer, program or
              provider mentioned.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
