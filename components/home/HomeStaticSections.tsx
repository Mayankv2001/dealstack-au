import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  Percent,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DealStackCalculator from "@/components/DealStackCalculator";
import SiteFooter from "@/components/SiteFooter";
import type { Store } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Stateless homepage sections, extracted from HomeClient so they
 * server-render (no hooks in this file; DealStackCalculator is itself a
 * client island). app/page.tsx composes them around the interactive islands
 * in the original DOM order.
 */

const savingsLayers = [
  {
    icon: Percent,
    iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "Cashback",
    description:
      "Earn a percentage back on every eligible purchase, paid out after the store confirms your order.",
    example: "≈ $18 back on a $300 order",
    exampleClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  {
    icon: CreditCard,
    iconClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    title: "Discounted gift cards",
    description:
      "Buy store gift cards below face value, then pay with them at checkout for an instant upfront discount.",
    example: "Up to 6% off before you shop",
    exampleClass: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  {
    icon: Sparkles,
    iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
    title: "Points & rewards",
    description:
      "Stack loyalty points and card rewards on the same spend, so nothing is left on the table.",
    example: "+2,400 points on a typical shop",
    exampleClass: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
  },
  {
    icon: BarChart3,
    iconClass: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    title: "Community deal signals",
    description:
      "See which deals the community is finding and verifying right now, ranked by real activity.",
    example: "Live from the community feed",
    exampleClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
];

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Manually curated & cached",
    description:
      "Every offer is reviewed and recorded by a person — never blindly auto-scraped from a feed.",
  },
  {
    icon: Clock,
    title: "“Last checked” on every offer",
    description:
      "See exactly when a deal was last verified, so you can judge how fresh it is.",
  },
  {
    icon: CheckCircle2,
    title: "Verify before you buy",
    description:
      "Always confirm the rate and terms at the store before checkout. Offers can change.",
  },
  {
    icon: Lock,
    title: "No automatic publishing",
    description:
      "Community feeds are reviewed first — nothing goes public from a raw feed unchecked.",
  },
];

/** Savings layers (#how-it-works). */
export function SavingsLayersSection() {
  return (
    <section id="how-it-works" className="scroll-mt-16 border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          The savings layers
        </p>
        <h2 className="mt-3 max-w-2xl font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          Four ways to save, stacked on one purchase
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Each layer works on its own. Stacked together on the same cart,
          they compound into a meaningfully lower effective price.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {savingsLayers.map((layer) => (
            <div
              key={layer.title}
              className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl",
                  layer.iconClass
                )}
              >
                <layer.icon className="size-5" />
              </span>
              <p className="mt-5 font-semibold">{layer.title}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {layer.description}
              </p>
              <span
                className={cn(
                  "mt-5 inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium",
                  layer.exampleClass
                )}
              >
                {layer.example}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Calculator section — static wrapper around the calculator island. */
export function CalculatorSection({ stores }: { stores: Store[] }) {
  return (
    <section
      id="calculator"
      className="mx-auto flex max-w-6xl scroll-mt-16 flex-col items-center px-4 py-16 sm:px-6 sm:py-20"
    >
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Try your own numbers
        </p>
        <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          See your own stack in dollars
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Pick a store or enter your own rates to see the real out-of-pocket
          price after every layer.
        </p>
      </div>
      <DealStackCalculator stores={stores} />
    </section>
  );
}

/** Trust & safety (#trust). */
export function TrustSection() {
  return (
    <section id="trust" className="scroll-mt-16 border-y bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Trust &amp; safety
          </p>
          <h2 className="mt-3 font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
            Curated by people, not scraped by bots
          </h2>
          <p className="mt-4 max-w-md text-sm text-muted-foreground sm:text-base">
            Deals move fast and terms change. We keep things honest: every
            offer is reviewed and cached by a person, timestamped, and
            clearly flagged for you to verify before you buy.
          </p>
          <a
            href="#disclaimer"
            className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Read our sourcing policy
            <ArrowRight className="size-4" />
          </a>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {trustPoints.map((point) => (
            <div
              key={point.title}
              className="rounded-2xl border bg-card p-6 shadow-sm"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <point.icon className="size-5" />
              </span>
              <p className="mt-4 font-semibold">{point.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Final CTA. */
export function FinalCTASection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-950 to-[#0a1410] px-6 py-14 text-center shadow-xl sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl"
        />
        <div className="relative mx-auto max-w-xl">
          <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100">
            No fees · No catch
          </span>
          <h2 className="mt-5 font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Start stacking smarter
          </h2>
          <p className="mt-4 text-emerald-100/80">
            Search any store and see your full stack — cashback, gift cards,
            points and signals — in seconds.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-white text-emerald-900 hover:bg-emerald-50"
            >
              <a href="#stores">
                Get started
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/25 bg-white/0 text-white hover:bg-white/10 hover:text-white"
            >
              <a href="#how-it-works">How it works</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Homepage footer with in-page anchors and the sourcing disclaimer. */
export function HomeFooter() {
  return <SiteFooter />;
}
