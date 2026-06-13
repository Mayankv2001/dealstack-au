import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CreditCard,
  Flame,
  Gift,
  Layers,
  Sparkles,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import WeeklyDealCard, {
  type WeeklyDealCardData,
  type WeeklyDealTone,
} from "@/components/WeeklyDealCard";
import { stores } from "@/lib/data";
import {
  cashbackOffers,
  giftCardOffers,
  ozBargainSignals,
  pointsOffers,
  weeklyDeals,
} from "@/lib/offers/manualOffers";
import type { WeeklyHighlight } from "@/lib/offers/types";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Weekly Deals — DealStack AU",
  description:
    "This week's best deal stacks, gift card offers, points boosts, cashback boosts and community signals — static MVP examples.",
};

/**
 * Weekly Deals page.
 *
 * Reads only static/manual data (lib/offers/manualOffers.ts) and the pure
 * stack engine (lib/stack/buildStack.ts). No network, no database. Existing
 * pages, layout.tsx and globals.css are untouched.
 */

const WEEK_LABEL = "Week of 8 June 2026";

const storeName = (id: string | null): string | null =>
  id ? (stores.find((s) => s.id === id)?.name ?? null) : null;

/** Build the computed stacks once; show the strongest first. */
const recommendations = buildStackRecommendations().slice(0, 6);

// ─── Map static offers → normalised WeeklyDealCard data ────────────────────

const highlightTone: Record<WeeklyHighlight, WeeklyDealTone> = {
  "best-stack": "emerald",
  "gift-card": "violet",
  points: "amber",
  cashback: "emerald",
  signal: "orange",
  "needs-verification": "amber",
};

const curatedPicks: WeeklyDealCardData[] = weeklyDeals.map((deal) => ({
  kind: deal.highlight === "points" ? "points" : "gift-card",
  category:
    deal.highlight === "best-stack"
      ? "Curated pick"
      : deal.highlight === "needs-verification"
        ? "Verify first"
        : `${deal.highlight[0].toUpperCase()}${deal.highlight.slice(1).replace("-", " ")}`,
  title: deal.title,
  summary: deal.summary,
  subject: storeName(deal.merchantId),
  tone: highlightTone[deal.highlight],
  icon: deal.highlight === "best-stack" ? Layers : undefined,
  expiryDate: deal.expiryDate,
  confidence: deal.confidence,
  citations: deal.citations,
}));

const giftCardCards: WeeklyDealCardData[] = giftCardOffers.map((o) => {
  const acceptedAt = o.acceptedAtMerchantIds
    .map(storeName)
    .filter(Boolean)
    .join(", ");
  const summaryBits = [
    o.discountPercent > 0
      ? `${o.discountPercent}% off ${o.brand} cards via ${o.source}.`
      : `${o.brand} cards via ${o.source}.`,
    acceptedAt ? `Spend at ${acceptedAt}.` : null,
    o.pointsOnPurchase ? `${o.pointsOnPurchase.earnNote}.` : null,
  ].filter(Boolean);
  return {
    kind: "gift-card",
    category: "Gift card offer",
    title: `${o.brand} gift cards`,
    summary: summaryBits.join(" "),
    subject: o.source,
    highlight:
      o.discountPercent > 0
        ? `${o.discountPercent}% off`
        : o.pointsOnPurchase
          ? "Bonus points"
          : null,
    tone: "violet",
    expiryDate: o.expiryDate,
    lastCheckedAt: o.lastCheckedAt,
    confidence: o.confidence,
    citations: o.citations,
  };
});

const pointsCards: WeeklyDealCardData[] = pointsOffers.map((o) => ({
  kind: "points",
  category: "Points boost",
  title: `${o.program}: ${o.earnRateDisplay}`,
  summary:
    o.mechanism === "in-store-boost"
      ? "Sample activated in-store boost — activate in-app before you shop to earn the bonus."
      : "Sample base earn rate on eligible spend at this merchant.",
  subject: storeName(o.merchantId),
  highlight: o.earnMultiple ? `${o.earnMultiple}x points` : o.earnRateDisplay,
  tone: "amber",
  expiryDate: o.expiryDate,
  lastCheckedAt: o.lastCheckedAt,
  confidence: o.confidence,
  citations: o.citations,
}));

const cashbackCards: WeeklyDealCardData[] = cashbackOffers.map((o) => ({
  kind: "cashback",
  category: "Cashback boost",
  title: `${o.ratePercent}% ${o.provider} cashback`,
  summary: o.termsSummary,
  subject: storeName(o.merchantId),
  highlight: `${o.ratePercent}% back${o.isUpsized ? " (upsized)" : ""}`,
  tone: "emerald",
  expiryDate: o.expiryDate,
  lastCheckedAt: o.lastCheckedAt,
  confidence: o.confidence,
  citations: o.citations,
}));

const signalCards: WeeklyDealCardData[] = ozBargainSignals.map((o) => ({
  kind: "discount-code",
  category: "OzBargain signal",
  title: o.title,
  summary: o.summary,
  subject: storeName(o.merchantId),
  highlight: o.votesSample ? `${o.votesSample} community votes` : null,
  tone: "orange",
  icon: Flame,
  expiryDate: null,
  lastCheckedAt: o.lastCheckedAt,
  confidence: o.confidence,
  citations: [{ source: "ozbargain", sourceUrl: o.sourceUrl }],
}));

// ─── Section scaffolding ───────────────────────────────────────────────────

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
  "Gift card acceptance and discounts vary by store and change weekly — confirm the card is accepted before buying.",
  "Most cashback offers exclude gift card payment. You usually cannot claim cashback and a discounted gift card on the same order.",
  "Points boosts almost always need to be activated in the program app before you shop.",
  "Effective prices and points values are estimates on an example spend, not guaranteed outcomes.",
];

export default function DealsPage() {
  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="hidden sm:inline-flex"
            >
              <Link href="/">Stores</Link>
            </Button>
            <span
              aria-current="page"
              className="inline-flex h-8 items-center rounded-md bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
            >
              Deals
            </span>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="hidden sm:inline-flex"
            >
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
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              This week&apos;s best deal stacks, gift card offers, points boosts,
              cashback boosts and community signals — combined into effective
              prices you can act on. Static MVP examples.
            </p>
          </div>

          {/* Disclaimer */}
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              These are static/manual MVP examples. Offers change quickly. Always
              verify with the original source, cashback provider, gift card
              portal, or retailer before purchasing.
            </span>
          </p>
        </div>

        {/* Curated picks (from weeklyDeals) */}
        {curatedPicks.length > 0 && (
          <section className="mt-6">
            <SectionHeading
              icon={Sparkles}
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              title="Curated picks this week"
              subtitle="Hand-picked highlights across every layer of the stack."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {curatedPicks.map((data, i) => (
                <WeeklyDealCard key={`pick-${i}`} data={data} />
              ))}
            </div>
          </section>
        )}

        {/* 1 — Best stack recommendations */}
        <section className="mt-8">
          <SectionHeading
            icon={Layers}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            title="Best stack recommendations this week"
            subtitle="Discount + gift card + cashback + points combined on a $500 example spend."
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((rec) => (
              <StackRecommendationCard
                key={rec.merchantId}
                recommendation={rec}
              />
            ))}
          </div>
        </section>

        {/* 2 — Gift card offers */}
        <section className="mt-8">
          <SectionHeading
            icon={Gift}
            iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            title="Weekly gift card offers"
            subtitle="Discounted cards and bonus-points promos to pre-buy your spend."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {giftCardCards.map((data, i) => (
              <WeeklyDealCard key={`gc-${i}`} data={data} />
            ))}
          </div>
        </section>

        {/* 3 — Points boosts */}
        <section className="mt-8">
          <SectionHeading
            icon={Star}
            iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            title="Points boosts"
            subtitle="Activated multipliers and base earn rates worth stacking."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pointsCards.map((data, i) => (
              <WeeklyDealCard key={`pts-${i}`} data={data} />
            ))}
          </div>
        </section>

        {/* 4 — Cashback boosts */}
        <section className="mt-8">
          <SectionHeading
            icon={CreditCard}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            title="Cashback boosts"
            subtitle="ShopBack and TopCashback rates — note gift card exclusions."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cashbackCards.map((data, i) => (
              <WeeklyDealCard key={`cb-${i}`} data={data} />
            ))}
          </div>
        </section>

        {/* 5 — OzBargain signals */}
        <section className="mt-8">
          <SectionHeading
            icon={Flame}
            iconClass="bg-orange-500/10 text-orange-600 dark:text-orange-400"
            title="OzBargain deal signals"
            subtitle="Community-reported activity to corroborate before you act."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {signalCards.map((data, i) => (
              <WeeklyDealCard key={`sig-${i}`} data={data} />
            ))}
          </div>
        </section>

        {/* 6 — Verification notes */}
        <section className="mt-8">
          <SectionHeading
            icon={AlertTriangle}
            iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            title="Important verification notes"
            subtitle="Read before relying on any stack above."
          />
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 shadow-sm sm:p-5">
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
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
