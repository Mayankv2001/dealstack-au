import Link from "next/link";
import { ArrowRight, Gift, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatAUD } from "@/lib/calculateStack";
import { compatibilityStatusLabel } from "@/lib/giftcards/compatibility";
import type { RetailerGiftCardPlan } from "@/lib/decision/types";

const ROLE_LABEL = {
  included: "Included in best plan",
  alternative: "Choose instead",
  available: "Evaluated — not in best stack",
} as const;

function mechanicLabel(
  option: RetailerGiftCardPlan["giftCardOptions"][number],
): string {
  const { offer } = option;
  if (offer.promotionType === "points") {
    if (offer.pointsMultiplier != null) {
      return `${offer.pointsMultiplier}x ${offer.pointsProgram ?? "rewards"} points`;
    }
    if (offer.fixedPoints != null) {
      return `${offer.fixedPoints.toLocaleString("en-AU")} ${offer.pointsProgram ?? "rewards"} points`;
    }
  }
  if (offer.promotionType === "bonus-value" && offer.bonusPercent != null) {
    return `${offer.bonusPercent}% bonus gift-card value`;
  }
  if (offer.discountPercent > 0) {
    return `${offer.discountPercent}% off gift-card value`;
  }
  if (offer.promoCreditDollars != null) {
    return `${formatAUD(offer.promoCreditDollars)} future credit`;
  }
  return "Reviewed gift-card offer";
}

function outcome(option: RetailerGiftCardPlan["giftCardOptions"][number]): string {
  if (option.immediateCashSaving > 0) {
    return `${formatAUD(option.immediateCashSaving)} immediate cash saving`;
  }
  if (option.pointsEarned != null) {
    return `${option.pointsEarned.toLocaleString("en-AU")} points${
      option.estimatedRewardsValue != null
        ? ` · about ${formatAUD(option.estimatedRewardsValue)} rewards value`
        : ""
    }`;
  }
  if (option.bonusCardValue != null) {
    return `${formatAUD(option.bonusCardValue)} extra card value`;
  }
  if (option.futureCreditValue != null) {
    return `${formatAUD(option.futureCreditValue)} future credit — cash paid is unchanged`;
  }
  return "Reviewed gift-card acquisition offer";
}

export default function RetailerGiftCardPlans({
  plans,
  spend,
}: {
  plans: RetailerGiftCardPlan[];
  spend: number;
}) {
  if (plans.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby="retailer-gift-card-options">
      <div className="flex items-center gap-2">
        <Gift aria-hidden className="size-5 text-violet-600" />
        <h2 id="retailer-gift-card-options" className="text-xl font-bold">
          Gift-card ways to pay by retailer
        </h2>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        These options appear only where the card has recorded redemption
        coverage for that retailer. Points and bonus value stay separate from
        the cash price.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => (
          <Card key={`${plan.productTitle ?? "store"}:${plan.merchantId}`}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {plan.productTitle ? "Retailer option" : "Selected retailer"}
                  </p>
                  <h3 className="mt-1 text-lg font-bold">{plan.merchantName}</h3>
                  {plan.listedPrice != null ? (
                    <p className="text-sm text-muted-foreground">
                      Purchase amount {formatAUD(plan.listedPrice)}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/search?q=${encodeURIComponent(plan.merchantName)}&spend=${plan.listedPrice ?? spend}`}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold hover:border-emerald-500/40 hover:bg-emerald-500/[0.05]"
                >
                  Build {plan.merchantName} plan
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </div>

              {plan.giftCardOptions.length ? (
                <div className="mt-4 space-y-3">
                  {plan.giftCardOptions.map((option) => (
                    <article
                      key={option.offer.id}
                      className="rounded-xl border bg-muted/20 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{mechanicLabel(option)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            <span>{option.offer.brand}</span> gift card · use at{" "}
                            {plan.merchantName}
                          </p>
                        </div>
                        <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                          {ROLE_LABEL[option.role]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        {outcome(option)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Buy {formatAUD(option.coveredGiftCardValue)} card value
                        from {option.offer.purchaseLocation ?? option.offer.source}
                        {option.cashPaid !== option.coveredGiftCardValue
                          ? ` for ${formatAUD(option.cashPaid)}`
                          : ""}
                        .
                      </p>
                      {option.estimatedCardCount != null ||
                      option.denominationRequirement ||
                      option.maxUsableAmount != null ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {[
                            option.estimatedCardCount != null
                              ? `At least ${option.estimatedCardCount} card${option.estimatedCardCount === 1 ? "" : "s"}`
                              : null,
                            option.perCardMaximum != null
                              ? `${formatAUD(option.perCardMaximum)} maximum per card`
                              : null,
                            option.maxUsableAmount != null
                              ? `${formatAUD(option.maxUsableAmount)} promotional value cap`
                              : null,
                            option.denominationRequirement,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {/* Headline stays scannable; every caveat lives in one
                          collapsible block instead of four stacked paragraphs. */}
                      <details className="mt-2 text-xs">
                        <summary className="inline-flex cursor-pointer items-center gap-1.5 font-semibold">
                          {option.pointsEarned != null ? (
                            <Sparkles aria-hidden className="size-3.5 shrink-0 text-amber-500" />
                          ) : (
                            <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-emerald-600" />
                          )}
                          What to check before you buy ·{" "}
                          {compatibilityStatusLabel(option.compatibilityStatus)}
                        </summary>
                        <p className="mt-2 text-muted-foreground">
                          {option.compatibilityReason}
                        </p>
                        {option.engineNote &&
                        option.engineNote !== option.compatibilityReason ? (
                          <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 font-medium text-amber-800 dark:text-amber-300">
                            {option.engineNote}
                          </p>
                        ) : null}
                        <p className="mt-2 text-muted-foreground">
                          {option.evidenceLabel} ·{" "}
                          {option.evidenceFreshness === "current"
                            ? "current evidence"
                            : option.evidenceFreshness === "stale"
                              ? "stale evidence"
                              : "check date not recorded"}
                          {option.redemptionChannels.length
                            ? ` · ${option.redemptionChannels.join(", ")}`
                            : " · redemption channel not recorded"}
                        </p>
                        <p className="mt-2 font-semibold text-foreground">
                          Purchase steps
                        </p>
                        <ol className="mt-1 space-y-1 pl-5 text-muted-foreground">
                          {option.orderedSteps.map((step) => (
                            <li key={step} className="list-decimal">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </details>
                      <Link
                        href={`/gift-cards/${option.offer.id}`}
                        className="mt-3 inline-flex text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        Check offer conditions
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed p-4">
                  <p className="text-sm font-semibold">
                    No approved gift-card payment option recorded
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    DealStack will not assume a card works here without
                    retailer-specific acceptance evidence.
                  </p>
                </div>
              )}
              {plan.excludedGiftCardOptions.length > 0 ? (
                <details className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Options not recommended ({plan.excludedGiftCardOptions.length})
                  </summary>
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {plan.excludedGiftCardOptions.map((option) => (
                      <li key={option.offer.id}>
                        <span className="font-semibold text-foreground">
                          {option.offer.brand}:
                        </span>{" "}
                        {option.exclusionReason ?? option.compatibilityReason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
