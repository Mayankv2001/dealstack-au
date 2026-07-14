import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, CalendarDays, CheckCircle2 } from "lucide-react";
import type { GiftCardOffer } from "@/lib/offers/types";
import {
  buildGiftCardOfferCardViewModel,
  type GiftCardCompatibilityTone,
} from "@/lib/giftcards/offerCardViewModel";
import { cn } from "@/lib/utils";

/**
 * Presentational gift-card offer card. It renders a pre-computed view model
 * (lib/giftcards/offerCardViewModel) and never interprets raw offer fields —
 * that is what keeps a 33-brand comma list from blowing up a card and a missing
 * date from reading as "Ongoing". Height is driven by bounded, clamped content
 * so a row of cards stays uniform; the footer is pinned with mt-auto so it lines
 * up across the grid without leaving oversized gaps.
 */

const TONE_CHIP: Record<GiftCardCompatibilityTone, string> = {
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  negative: "bg-red-500/10 text-red-700 dark:text-red-300",
  neutral: "bg-muted text-muted-foreground",
};

export function GiftCardOfferCard({
  offer,
  now,
}: {
  offer: GiftCardOffer;
  now?: Date;
}) {
  const vm = buildGiftCardOfferCardViewModel(offer, now);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md">
      {/* Header band: brand mark · mechanic · value badge */}
      <div className="flex items-center justify-between gap-2 border-b bg-emerald-50/60 px-3.5 py-2.5 dark:bg-emerald-950/20">
        <div className="flex min-w-0 items-center gap-2">
          {vm.logoSrc ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-white p-1 shadow-sm">
              <Image
                src={vm.logoSrc}
                alt={`${vm.brandPrimary} logo`}
                width={72}
                height={36}
                unoptimized
                className="max-h-7 w-auto object-contain"
              />
            </span>
          ) : (
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-xs font-black tracking-tight text-white dark:bg-white dark:text-stone-900"
            >
              {vm.initials}
            </span>
          )}
          {/* Skip the mechanic when the value badge already says the same
              thing ("Bonus points" + "BONUS POINTS" read as a duplicate). */}
          {vm.mechanicLabel.toLowerCase() !== vm.valueBadge.toLowerCase() ? (
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
              {vm.mechanicLabel}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-black tracking-tight text-white shadow-sm">
          {vm.valueBadge}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-base font-bold leading-tight tracking-tight">
            <Link href={vm.detailHref} className="hover:text-emerald-700">
              {vm.brandPrimary}
            </Link>
          </h3>
          {vm.brandSecondary ? (
            <span
              className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
              title={`Covers ${vm.brandCount} gift-card brands`}
            >
              {vm.brandSecondary}
            </span>
          ) : null}
        </div>

        <p className="truncate text-sm font-medium text-foreground/90">
          {vm.headline}
        </p>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-y py-2 text-[10px]">
          {[
            ["Buy from", vm.sellerLabel],
            ["Offer source", vm.sourceLabel],
            ["Card brand", vm.brandPrimary],
            ["Redeem at", vm.redeemAtLabel],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </dt>
              <dd
                className="truncate text-xs font-medium text-foreground"
                title={value}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{vm.dateLabel}</span>
          {vm.urgencyLabel ? (
            <span className="ml-auto shrink-0 font-semibold text-amber-700 dark:text-amber-300">
              {vm.urgencyLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5",
              TONE_CHIP[vm.compatibilityTone],
            )}
          >
            {vm.compatibilityLabel}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {vm.trustLabel === "Verified by DealStack" ? (
              <BadgeCheck className="size-3 text-emerald-600" />
            ) : (
              <CheckCircle2 className="size-3" />
            )}
            {vm.trustLabel}
          </span>
        </div>

        {vm.pointsDisclosure ? (
          <p className="text-[10px] leading-tight text-muted-foreground">
            {vm.pointsDisclosure}
          </p>
        ) : null}

        <div className="mt-auto flex items-center gap-2 pt-2.5">
          <Link
            href={vm.detailHref}
            className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
          >
            View details
          </Link>
          {vm.buildStackHref ? (
            <Link
              href={vm.buildStackHref}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-2.5 text-xs font-semibold hover:bg-muted"
            >
              Build stack
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default GiftCardOfferCard;
