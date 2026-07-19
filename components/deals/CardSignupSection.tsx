import { ChevronDown, CreditCard, ExternalLink } from "lucide-react";
import { formatAUD } from "@/lib/calculateStack";
import { estimateFirstYearValue } from "@/lib/offers/cardValue";
import type { CardOffer } from "@/lib/offers/types";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * "Considering a new credit card?" — an OPTIONAL, clearly separated section.
 * Sign-up bonuses are never part of a product's headline saving, checkout
 * price or ranking; this section exists only so a shopper who was going to
 * apply anyway can see how a planned spend interacts with a minimum-spend
 * threshold. Collapsed by default, conservative numbers, no advice.
 */

function headline(offer: CardOffer): string {
  if (offer.bonusPoints) {
    return `${offer.bonusPoints.toLocaleString("en-AU")} bonus points`;
  }
  if (offer.statementCreditAmount) {
    return `${formatAUD(offer.statementCreditAmount)} statement credit`;
  }
  if (offer.cashbackAmount) {
    return `${formatAUD(offer.cashbackAmount)} cashback`;
  }
  return offer.offerSummary;
}

function OfferRow({ offer, spend }: { offer: CardOffer; spend: number }) {
  const estimate = estimateFirstYearValue(offer);
  const sourceUrl = safePublicSourceUrl(offer.sourceUrl);
  const contributes =
    offer.minimumSpend != null && spend > 0
      ? spend >= offer.minimumSpend
        ? `Your planned ${formatAUD(spend)} spend alone would meet the ${formatAUD(offer.minimumSpend)} threshold.`
        : `Your planned ${formatAUD(spend)} spend counts toward the ${formatAUD(offer.minimumSpend)} threshold but does not meet it alone.`
      : null;
  return (
    <div className="border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {offer.provider} {offer.cardName}
        </p>
        <span
          className={
            offer.confidence === "confirmed"
              ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300"
              : "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300"
          }
        >
          {offer.confidence === "confirmed"
            ? `Checked ${formatDateAU(offer.lastCheckedAt.slice(0, 10)) ?? ""}`
            : "Unverified — check the issuer's current terms"}
        </span>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline font-medium text-foreground">Bonus: </dt>
          <dd className="inline">{headline(offer)}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">
            Conservative value:{" "}
          </dt>
          <dd className="inline">
            {estimate.pointsValue != null
              ? `${formatAUD(estimate.pointsValue + estimate.cashBenefits)} (points valued at ${offer.pointValueCents ?? 0}c each)`
              : "No per-point valuation recorded"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Annual fee: </dt>
          <dd className="inline">
            {offer.annualFee != null ? formatAUD(offer.annualFee) : "Not recorded"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">
            Minimum spend:{" "}
          </dt>
          <dd className="inline">
            {offer.minimumSpend != null
              ? `${formatAUD(offer.minimumSpend)}${offer.minimumSpendPeriod ? ` in ${offer.minimumSpendPeriod}` : ""}`
              : "Not recorded"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">
            First-year value after fee:{" "}
          </dt>
          <dd className="inline">
            {estimate.netValue != null
              ? formatAUD(estimate.netValue)
              : "Cannot be estimated from recorded data"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">
            Purchase interest rate:{" "}
          </dt>
          <dd className="inline">
            Not recorded — figures assume the balance is paid in full every
            month
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline font-medium text-foreground">Eligibility: </dt>
          <dd className="inline">{offer.eligibilityNotes}</dd>
        </div>
        {contributes ? (
          <div className="sm:col-span-2">
            <dt className="inline font-medium text-foreground">
              Your planned spend:{" "}
            </dt>
            <dd className="inline">{contributes}</dd>
          </div>
        ) : null}
      </dl>
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Issuer source <ExternalLink aria-hidden className="size-3" />
        </a>
      ) : null}
    </div>
  );
}

export function CardSignupSection({
  offers,
  spend,
}: {
  offers: CardOffer[];
  spend: number;
}) {
  if (offers.length === 0) return null;
  return (
    <details className="group/cards mt-10 rounded-xl border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <CreditCard aria-hidden className="size-4 text-muted-foreground" />
          Considering a new credit card? ({offers.length} reviewed{" "}
          {offers.length === 1 ? "offer" : "offers"})
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 transition-transform group-open/cards:rotate-180"
        />
      </summary>
      <div className="border-t px-4 pb-4">
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Sign-up bonuses are never included in a deal&rsquo;s headline saving
          or checkout price, and never change how deals are ranked. Approval
          and bonus eligibility are not guaranteed. This is reviewed
          information, not financial advice — check the issuer&rsquo;s current
          terms before applying.
        </p>
        {offers.map((offer) => (
          <OfferRow key={offer.id} offer={offer} spend={spend} />
        ))}
      </div>
    </details>
  );
}

export default CardSignupSection;
