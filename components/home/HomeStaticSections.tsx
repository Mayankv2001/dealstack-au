import { Suspense } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgePercent,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Gift,
  Search,
  ShieldCheck,
  Star,
} from "lucide-react";
import DealStackCalculator from "@/components/DealStackCalculator";
import SearchBar from "@/components/SearchBar";
import SiteFooter from "@/components/SiteFooter";
import StackSourceDisclosure from "@/components/StackSourceDisclosure";
import StoreLogo from "@/components/StoreLogo";
import { Button } from "@/components/ui/button";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type { StackLayer, StackRecommendation } from "@/lib/offers/types";
import { summariseCitations } from "@/lib/stack/citationSummary";
import { summariseStackOutcome } from "@/lib/stack/outcome";
import { stackTrustStatus, summariseConditions } from "@/lib/stack/present";

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

export function FeaturedStackSection({ recommendation, stores }: { recommendation: StackRecommendation | null; stores: Store[] }) {
  if (!recommendation) return null;
  const store = stores.find((candidate) => candidate.id === recommendation.merchantId);
  const outcome = summariseStackOutcome(recommendation);
  const trust = stackTrustStatus(recommendation);
  const conditions = summariseConditions(recommendation);
  return (
    <section id="featured-stack" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">Featured stack</p>
        <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">Compatibility matters more than headline maths</h2>
      </div>
      <article className="rounded-2xl border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
          <div className="flex items-center gap-3">
            <StoreLogo store={store} text={recommendation.merchantName.slice(0, 2).toUpperCase()} size="md" />
            <div><h3 className="text-xl font-bold">{recommendation.title}</h3><p className="mt-1 text-sm text-muted-foreground">Example spend {formatAUD(recommendation.basePrice)}</p></div>
          </div>
          <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{trust.label}</span>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cash flow</h4>
            <dl className="mt-3 divide-y rounded-xl border px-4">
              <OutcomeRow label="Original cart" value={formatAUD(outcome.originalCart)} />
              <OutcomeRow label="Checkout cost" value={formatAUD(outcome.checkoutCost)} />
              {outcome.giftCardSaving > 0 ? <OutcomeRow label="Gift-card saving" value={`−${formatAUD(outcome.giftCardSaving)}`} saving /> : null}
              <OutcomeRow label="Cash paid for checkout" value={formatAUD(outcome.cashPaidForCheckout)} />
              {outcome.cashbackLater > 0 ? <OutcomeRow label="Cashback expected later" value={`−${formatAUD(outcome.cashbackLater)}`} saving /> : null}
              <OutcomeRow label="Effective final cost" value={formatAUD(outcome.effectiveFinalCost)} strong />
            </dl>
            {outcome.pointsEarned > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <p className="font-semibold text-amber-950 dark:text-amber-200">~{outcome.pointsEarned.toLocaleString("en-AU")} points earned</p>
                <p className="mt-1 text-xs text-muted-foreground">{outcome.pointsValueDollars > 0 ? `Estimated value ${formatAUD(outcome.pointsValueDollars)}. ` : ""}Shown separately and not deducted from cash cost.</p>
              </div>
            ) : null}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layers and conditions</h4>
            <ul className="mt-3 space-y-2">
              {recommendation.components.map((component, index) => (
                <li key={`${component.layer}-${index}`} className={component.optional ? "rounded-lg border border-dashed bg-muted/40 p-3" : "rounded-lg border p-3"}>
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{component.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{component.optional ? "Alternative — choose one" : layerTiming(component.layer)}{component.note ? ` · ${component.note}` : ""}</p></div><span className="shrink-0 text-sm font-semibold text-emerald-800 dark:text-emerald-300">{component.layer === "points" ? `${(component.pointsEarned ?? 0).toLocaleString("en-AU")} pts` : component.valueDollars ? `−${formatAUD(component.valueDollars)}` : ""}</span></div>
                </li>
              ))}
            </ul>
            {conditions.all.length ? (
              <details className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Compatibility warnings ({conditions.all.length})</summary>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">{conditions.all.map((warning, index) => <li key={`${warning.code}-${index}`}>• {warning.message}</li>)}</ul>
              </details>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-xs text-muted-foreground">
            <p><Clock aria-hidden className="mr-1 inline size-3.5" />{recommendation.checkedAsOf ? `Oldest included layer checked ${formatChecked(recommendation.checkedAsOf)}` : "No checked time available"}</p>
            <StackSourceDisclosure citations={recommendation.citations} className="mt-2" />
          </div>
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/stores/${recommendation.merchantId}`}>View store stack</Link></Button><Button asChild><Link href={`/?stack=${recommendation.merchantId}#calculator`}>Use in calculator <ArrowRight aria-hidden /></Link></Button></div>
        </div>
      </article>
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

const trustPoints = [
  "Reviewed before publishing",
  "Every offer is timestamped",
  "Sources are visible",
  "Conditions and exclusions are preserved",
  "Raw feed content is never published automatically",
] as const;

export function TrustSection({ recommendation }: { recommendation: StackRecommendation | null }) {
  const trust = recommendation ? stackTrustStatus(recommendation) : null;
  const sourceSummary = recommendation ? summariseCitations(recommendation.citations) : null;
  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">Trust and sourcing</p><h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">Evidence beside every claim</h2><p className="mt-4 text-sm leading-relaxed text-muted-foreground">DealStack stages RSS and feed discoveries privately, then publishes only after human review. Rates can still change, so source links and conditions stay visible.</p><p className="mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"><ShieldCheck aria-hidden className="size-4 text-emerald-800" />Human-reviewed · No automatic publication</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <ul className="space-y-3 rounded-xl border bg-card p-5">{trustPoints.map((point) => <li key={point} className="flex items-start gap-2 text-sm"><CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-700" />{point}</li>)}</ul>
          <div className="rounded-xl border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Example verification record</p>{recommendation ? <><p className="mt-4 text-sm font-semibold">{recommendation.merchantName} stack</p><dl className="mt-3 space-y-2 text-sm"><RecordRow label="Status" value={trust?.label ?? "Review required"} /><RecordRow label="Checked" value={recommendation.checkedAsOf ? formatChecked(recommendation.checkedAsOf) : "Time unavailable"} /><RecordRow label="Sources" value={sourceSummary?.visibleProviders.map((provider) => provider.displayName).join(", ") || "No public source names"} /></dl></> : <p className="mt-4 text-sm text-muted-foreground">No current stack verification record is available.</p>}<Link href="/editorial-policy" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-sky-800 hover:underline dark:text-sky-300">Read editorial policy <ExternalLink aria-hidden className="size-3.5" /></Link></div>
        </div>
      </div>
    </section>
  );
}

export function FinalCTASection() {
  return <section className="border-t bg-stone-50/70"><div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-16"><Search aria-hidden className="mx-auto size-7 text-emerald-800" /><h2 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">Where are you shopping?</h2><p className="mt-2 text-sm text-muted-foreground">Search a store to see current layers, conditions and source links.</p><SearchBar size="lg" layout="split" className="mt-6" placeholder="Search a store, e.g. Myer, JB Hi-Fi or Amazon" buttonLabel="Search stores" /></div></section>;
}

function OutcomeRow({ label, value, saving = false, strong = false }: { label: string; value: string; saving?: boolean; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-3 text-sm"><dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt><dd className={strong ? "text-lg font-bold" : saving ? "font-semibold text-emerald-800 dark:text-emerald-300" : "font-semibold"}>{value}</dd></div>;
}

function RecordRow({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[5rem_1fr] gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>; }

function layerTiming(layer: StackLayer): string { return layer === "cashback" ? "Expected after purchase" : layer === "points" ? "Rewards shown separately" : "Reduces checkout outlay"; }

const CHECKED_FMT = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });
function formatChecked(iso: string): string { const ms = Date.parse(iso); return Number.isNaN(ms) ? "Time unavailable" : `${CHECKED_FMT.format(new Date(ms))} Sydney time`; }

export function HomeFooter() { return <SiteFooter />; }
