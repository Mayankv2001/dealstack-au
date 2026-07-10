import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Gift,
  Layers,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Logo from "@/components/Logo";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import WeeklyDealCard from "@/components/WeeklyDealCard";
import type { WeeklyPickCard } from "@/lib/offers/weeklyPicks";
import type { StackRecommendation } from "@/lib/offers/types";
import type { Store } from "@/lib/data";
import { cn } from "@/lib/utils";
import { CHECK_STEPS, verificationNotes } from "./dealsData";

/**
 * Stateless sections of the Weekly Deals page, extracted from DealsClient so
 * they server-render (no hooks anywhere in this file). DealsClient keeps only
 * the filterable middle of the page; app/deals/page.tsx composes the two in
 * the original DOM order.
 */

export function SectionHeading({
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

/** Sticky page header with the Deals item marked current. */
export function DealsHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
            <Link href="/stores">Stores</Link>
          </Button>
          <span
            aria-current="page"
            className="inline-flex h-8 items-center rounded-md bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            Deals
          </span>
          <Button asChild size="sm" variant="ghost">
            <Link href="/cards">Cards</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/resources">Resources</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="hidden bg-emerald-600 text-white hover:bg-emerald-700 sm:inline-flex"
          >
            <Link href="/#calculator">Calculator</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

/** Hero panel with the week-of badge and the top disclaimer. */
export function DealsHero({ weekLabel }: { weekLabel: string }) {
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 shadow-sm sm:p-5">
      <div className="max-w-2xl">
        <Badge
          variant="outline"
          className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        >
          <Sparkles className="size-3" />
          {weekLabel}
        </Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          Weekly{" "}
          <span className="text-emerald-600 dark:text-emerald-400">
            Deals
          </span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every rate here is{" "}
          <span className="font-medium text-foreground">
            manually curated and cached — not fetched live
          </span>
          . Each card shows when it was last checked; always confirm the
          offer at its source before buying.
        </p>
      </div>

      {/* Single strong disclaimer near the top */}
      <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Prices and rates move fast. Treat these as a curated starting
          point and confirm the live offer at its source before you spend.
        </span>
      </p>
    </div>
  );
}

/** 1 — This week's top stacks (always visible, scannable). */
export function TopStacksSection({
  topStacks,
  stores,
}: {
  topStacks: StackRecommendation[];
  stores: Store[];
}) {
  return (
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
            stores={stores}
            compact
            rank={i + 1}
          />
        ))}
      </div>
    </section>
  );
}

/** This week's picks — admin-curated weekly_deals rows, made visible. */
export function WeeklyPicksSection({ picks }: { picks: WeeklyPickCard[] }) {
  if (picks.length === 0) return null;
  return (
    <section className="mt-8">
      <SectionHeading
        icon={Sparkles}
        iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        title="This week's picks"
        subtitle="Hand-picked stacks and offers, curated after manual review — each pick lists the layers it combines."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((pick) => (
          <WeeklyDealCard key={pick.id} data={pick.data} />
        ))}
      </div>
    </section>
  );
}

/** How DealStack checks a stack. */
export function HowWeCheckSection() {
  return (
    <section className="mt-10">
      <SectionHeading
        icon={ShieldCheck}
        iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        title="How DealStack checks a stack"
        subtitle="Five quick checks behind every effective price."
      />
      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5">
          {CHECK_STEPS.map((step, i) => (
            <div key={step.title} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <step.icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-xs font-semibold leading-snug">
                {step.title}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {step.text}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

/** Coming soon: weekly stack alerts (static UI only). */
export function AlertsComingSoonSection() {
  return (
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
  );
}

/** How to verify + single bottom disclaimer. */
export function VerifySection() {
  return (
    <section className="mt-8">
      <SectionHeading
        icon={AlertTriangle}
        iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        title="How to verify before you buy"
        subtitle="Three quick checks that trip up stackers."
      />
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 shadow-sm sm:p-5">
        <ol className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-3">
          {verificationNotes.map((note, i) => (
            <li key={note} className="flex gap-2 text-xs leading-relaxed">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{note}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-amber-500/20 pt-3 text-xs leading-relaxed text-muted-foreground">
          <strong>Disclaimer:</strong> These offers are manually curated and
          served from a cache — not live data. Offers change quickly. Always verify with
          the original source, cashback provider, gift card portal, or
          retailer before purchasing. DealStack AU is not affiliated with any
          retailer, program or provider mentioned.
        </p>
      </div>
    </section>
  );
}
