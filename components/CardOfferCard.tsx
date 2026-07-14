import Link from "next/link";
import { ChevronDown, CreditCard, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckedLine,
  ConfidencePill,
  ExpiryLine,
} from "@/components/deals/DealMeta";
import { isExpiringSoonAU, isPastExpiry, todayAU } from "@/lib/offers/expiry";
import type { CardOffer, CardOfferType } from "@/lib/offers/types";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";
import { cn } from "@/lib/utils";

/**
 * Presentational card for a single bank/credit-card offer on the public
 * /cards page. CardOffer carries a single sourceUrl (the bank's own page),
 * rather than a Citation[] tied to the closed SourceId union.
 */

const OFFER_TYPE_LABELS: Record<CardOfferType, string> = {
  sign_up_bonus: "Sign-up bonus",
  cashback: "Cashback",
  statement_credit: "Statement credit",
  points_bonus: "Points bonus",
  annual_fee_discount: "Annual fee discount",
};

const TONE_BY_TYPE: Record<
  CardOfferType,
  { tile: string; text: string; grad: string }
> = {
  sign_up_bonus: {
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
    grad: "from-emerald-500/15 to-emerald-500/[0.03]",
  },
  points_bonus: {
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
    grad: "from-emerald-500/15 to-emerald-500/[0.03]",
  },
  cashback: {
    tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    text: "text-sky-700 dark:text-sky-400",
    grad: "from-sky-500/15 to-sky-500/[0.03]",
  },
  statement_credit: {
    tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    text: "text-sky-700 dark:text-sky-400",
    grad: "from-sky-500/15 to-sky-500/[0.03]",
  },
  annual_fee_discount: {
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    grad: "from-amber-500/15 to-amber-500/[0.03]",
  },
};

/** Headline figure for the banner, e.g. "100,000 pts", "$200 credit". */
function headline(offer: CardOffer): { value: string; caption?: string } {
  switch (offer.offerType) {
    case "sign_up_bonus":
    case "points_bonus":
      return offer.bonusPoints != null
        ? {
            value: `${offer.bonusPoints.toLocaleString()} pts`,
            caption: "bonus points",
          }
        : { value: "Bonus points" };
    case "cashback":
      return offer.cashbackAmount != null
        ? { value: `$${offer.cashbackAmount}`, caption: "cashback" }
        : { value: "Cashback offer" };
    case "statement_credit":
      return offer.statementCreditAmount != null
        ? {
            value: `$${offer.statementCreditAmount}`,
            caption: "statement credit",
          }
        : { value: "Statement credit" };
    case "annual_fee_discount":
      return offer.annualFee != null
        ? { value: `$${offer.annualFee}`, caption: "annual fee" }
        : { value: "Fee discount" };
    default:
      return { value: "Offer" };
  }
}

export function CardOfferCard({
  offer,
  selected = false,
  onSelectionChange,
}: {
  offer: CardOffer;
  selected?: boolean;
  onSelectionChange?: (selected: boolean) => void;
}) {
  const sourceHref = safePublicSourceUrl(offer.sourceUrl);
  const tone = TONE_BY_TYPE[offer.offerType];
  const { value, caption } = headline(offer);
  const expired = isPastExpiry(offer.expiryDate, todayAU());
  const expiringSoon = isExpiringSoonAU(offer.expiryDate);

  const facts: { label: string; value: string }[] = [];
  if (offer.annualFee != null) {
    facts.push({ label: "Annual fee", value: `$${offer.annualFee}` });
  }
  if (offer.minimumSpend != null) {
    facts.push({
      label: "Minimum spend",
      value: offer.minimumSpendPeriod
        ? `$${offer.minimumSpend.toLocaleString()} in ${offer.minimumSpendPeriod}`
        : `$${offer.minimumSpend.toLocaleString()}`,
    });
  }

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/10">
      <CardContent className="flex h-full flex-col p-0">
        {/* Banner */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b bg-gradient-to-br px-4 py-3",
            tone.grad,
          )}
        >
          <div>
            <p
              className={cn(
                "text-2xl font-extrabold leading-none tracking-tight",
                tone.text,
              )}
            >
              {value}
            </p>
            {caption ? (
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {caption}
              </p>
            ) : null}
          </div>
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              tone.tile,
            )}
          >
            <CreditCard className="size-5" />
          </span>
        </div>

        <div className="flex h-full flex-col gap-2 p-4">
          {onSelectionChange ? (
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => onSelectionChange(event.target.checked)}
                className="size-4 accent-emerald-600"
              />
              Add to comparison
            </label>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {OFFER_TYPE_LABELS[offer.offerType]}
            </Badge>
            <ConfidencePill confidence={offer.confidence} className="ml-auto" />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">
              {offer.cardName}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              via {offer.provider}
            </p>
          </div>

          {offer.offerSummary ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {offer.offerSummary}
            </p>
          ) : null}

          {facts.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 p-2.5">
              {facts.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </dt>
                  <dd className="text-[11px] font-medium leading-snug">
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {offer.eligibilityNotes ? (
            <details className="group rounded-lg border px-2.5 py-1.5">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                Eligibility notes
              </summary>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {offer.eligibilityNotes}
              </p>
            </details>
          ) : null}

          <div className="mt-auto flex flex-col gap-2 border-t pt-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ExpiryLine
                expiryDate={offer.expiryDate}
                expiringSoon={expiringSoon}
                expired={expired}
              />
              <CheckedLine lastCheckedAt={offer.lastCheckedAt} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/cards/${encodeURIComponent(offer.id)}`}>
                  Details
                </Link>
              </Button>
              {sourceHref ? (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={sourceHref}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                  >
                    Visit {offer.provider}
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CardOfferCard;
