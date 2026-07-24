import { Suspense } from "react";
import {
  AlertTriangle,
  BadgePercent,
  CreditCard,
  Gift,
  Star,
} from "lucide-react";
import DealStackCalculator from "@/components/DealStackCalculator";
import SiteFooter from "@/components/SiteFooter";
import type { StackRecommendation } from "@/lib/offers/types";

const steps = [
  { icon: BadgePercent, title: "Apply a discount code", text: "Reduce the store’s checkout price with an eligible public code." },
  { icon: Gift, title: "Pay with a discounted gift card", text: "Buy eligible payment value below face value before checkout." },
  { icon: CreditCard, title: "Activate cashback", text: "Start from the provider and follow its tracked-purchase conditions." },
  { icon: Star, title: "Earn points", text: "Scan or activate the applicable loyalty offer without subtracting points from cash cost." },
] as const;

export function SavingsLayersSection() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y bg-stone-50/70">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">How a stack is built</p>
        <h2 className="mt-2 max-w-2xl font-serif text-3xl font-bold tracking-tight sm:text-4xl">Four steps, with compatibility checked</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"><step.icon aria-hidden className="size-4" /></span>
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 flex max-w-3xl items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-200">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Not every layer is compatible. DealStack flags known exclusions and calculation conditions. Community content is a discovery source, not a saving layer.
        </p>
      </div>
    </section>
  );
}

export function CalculatorSection({ recommendations }: { recommendations: StackRecommendation[] }) {
  return (
    <section id="calculator" className="border-y bg-stone-50/70 scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">Calculator</p><h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">Calculate your own stack</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Use a sourced store stack or test a custom set of rates. Cashback is always separated from checkout cost.</p></div>
        <Suspense fallback={<div className="h-96 rounded-xl border bg-card" role="status"><span className="sr-only">Loading calculator</span></div>}><DealStackCalculator recommendations={recommendations} /></Suspense>
      </div>
    </section>
  );
}

export function HomeFooter() { return <SiteFooter />; }
