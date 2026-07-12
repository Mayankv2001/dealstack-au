import Link from "next/link";
import { CalendarClock, ExternalLink, Store, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GiftCardOffer } from "@/lib/offers/types";
import { expiryUrgencyLabelAU } from "@/lib/offers/expiry";
import { offerEffectiveSaving } from "@/lib/giftcards/publicQuery";
import { bonusEffectiveDiscountPercent, valuePointsOffer } from "@/lib/giftcards/value";
import { cn } from "@/lib/utils";

/**
 * Public gift-card offer card. Every figure comes from the shared valuation in
 * lib/giftcards/value.ts, and points/bonus offers carry an explicit disclosure
 * of HOW the effective saving is derived — cash paid and reward value are never
 * blurred into one "cash back" number. Offers reach here only after admin
 * approval (RLS is_published), so nothing on this card is raw or unreviewed.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Badge label derived from the offer's actual content, so it always agrees with
 * the headline even for legacy rows whose promotion_type defaults to "discount"
 * (e.g. a $0-discount card that exists only for points-on-purchase).
 */
function promoLabel(offer: GiftCardOffer): string {
  if (offer.promotionType === "bonus-value" || (offer.bonusPercent ?? 0) > 0) {
    return "Bonus value";
  }
  if (
    offer.promotionType === "points" ||
    (offer.pointsMultiplier ?? 0) > 0 ||
    (offer.discountPercent <= 0 && offer.pointsOnPurchase != null)
  ) {
    return "Points";
  }
  if (offer.discountPercent > 0) return "Discount";
  if (
    offer.promotionType === "membership" ||
    offer.membershipRequired ||
    offer.channel === "membership-portal"
  ) {
    return "Membership offer";
  }
  return "Offer";
}

/** Headline saving + an honest sub-line explaining how it is derived. */
function savingDisplay(offer: GiftCardOffer): { headline: string; sub: string | null } {
  const program = offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null;

  if (offer.promotionType === "bonus-value" && offer.bonusPercent) {
    const eff = bonusEffectiveDiscountPercent(offer.bonusPercent);
    return {
      headline: `≈${round1(eff)}% effective`,
      sub: `${round1(offer.bonusPercent)}% bonus value — $${round1(
        100 + offer.bonusPercent
      )} to spend for every $100 paid`,
    };
  }

  if (offer.promotionType === "points" && offer.pointsMultiplier && program) {
    const v = valuePointsOffer(offer.pointsMultiplier, 100, program, offer.pointsValueCents);
    if (v) {
      return {
        headline: `≈${round1(v.effectiveDiscountPercent)}% effective`,
        sub: `${round1(offer.pointsMultiplier)}× ${program} ≈ $${round1(
          v.valueDollars
        )} reward value per $100 (valued at ${v.pointValueCents}c/pt)`,
      };
    }
    return { headline: `${round1(offer.pointsMultiplier)}× ${program}`, sub: "Reward value varies — see programme terms." };
  }

  // A direct discount is the headline; a points-on-purchase bonus rides along.
  if (offer.discountPercent > 0) {
    return {
      headline: `${round1(offer.discountPercent)}% off`,
      sub: offer.pointsOnPurchase?.earnNote ?? null,
    };
  }

  // No discount, but earning points for BUYING the card is a real stacking
  // trick — surface it honestly rather than as a fake percentage.
  if (offer.pointsOnPurchase) {
    return { headline: "Points on purchase", sub: offer.pointsOnPurchase.earnNote };
  }

  // Genuine membership/portal offer with no quantified headline value.
  if (
    offer.promotionType === "membership" ||
    offer.membershipRequired ||
    offer.channel === "membership-portal"
  ) {
    return { headline: "Member offer", sub: null };
  }

  const effective = offerEffectiveSaving(offer);
  return {
    headline: effective != null ? `≈${round1(effective)}% effective` : "See offer details",
    sub: null,
  };
}

function ConditionBadges({ offer }: { offer: GiftCardOffer }) {
  const conditions: string[] = [];
  if (offer.membershipRequired) conditions.push("Membership required");
  if (offer.activationRequired) conditions.push("Activation required");
  if (offer.couponRequired) conditions.push("Coupon / code");
  if (offer.minSpend) conditions.push(`Min spend $${round1(offer.minSpend)}`);
  if (conditions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {conditions.map((c) => (
        <span
          key={c}
          className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

export function GiftCardOfferCard({ offer }: { offer: GiftCardOffer }) {
  const { headline, sub } = savingDisplay(offer);
  const urgency = expiryUrgencyLabelAU(offer.expiryDate);
  const acceptedAt = offer.acceptedAt ?? [];
  const purchaseFrom = offer.purchaseLocation ?? offer.source;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">
            <Link href={`/gift-cards/${offer.id}`} className="hover:text-primary hover:underline">
              {offer.brand}
            </Link>
          </h3>
          {purchaseFrom ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Store aria-hidden className="size-3" />
              <span className="truncate">Buy from {purchaseFrom}</span>
            </p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className="shrink-0 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        >
          {promoLabel(offer)}
        </Badge>
      </div>

      <div>
        <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
          {headline}
        </p>
        {sub ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{sub}</p>
        ) : null}
      </div>

      <ConditionBadges offer={offer} />

      {acceptedAt.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Spend at:</span>{" "}
          {acceptedAt.slice(0, 6).join(", ")}
          {acceptedAt.length > 6 ? ` +${acceptedAt.length - 6} more` : ""}
        </p>
      ) : null}

      {offer.denominationNote ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Ticket aria-hidden className="size-3" />
          {offer.denominationNote}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarClock aria-hidden className="size-3" />
          {offer.expiryDate ? (
            <span className={cn(urgency && "font-medium text-amber-700 dark:text-amber-300")}>
              {urgency ?? `Ends ${offer.expiryDate}`}
            </span>
          ) : (
            "No end date listed"
          )}
        </span>
        <Link
          href={`/gift-cards/${offer.id}`}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          View details <ExternalLink aria-hidden className="size-3" />
        </Link>
      </div>

      <p className="text-[11px] text-muted-foreground/80">
        {offer.sourceName ? `Via ${offer.sourceName} · ` : ""}
        Checked {offer.lastCheckedAt.slice(0, 10)} · confirm current terms before buying.
      </p>
    </article>
  );
}

export default GiftCardOfferCard;
