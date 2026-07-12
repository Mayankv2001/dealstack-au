import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Layers3,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import type { GiftCardOffer } from "@/lib/offers/types";
import { isMultiRetailer } from "@/lib/giftcards/publicQuery";
import { expiryUrgencyLabelAU } from "@/lib/offers/expiry";
import { cn } from "@/lib/utils";

const LOGOS: Record<string, string> = {
  "amazon au": "/logos/amazon-au.png",
  "chemist warehouse": "/logos/chemist-warehouse.avif",
  coles: "/logos/coles.svg",
  "coles group": "/logos/coles.svg",
  "jb hi-fi": "/logos/jb-hi-fi.png",
  kogan: "/logos/kogan.png",
  myer: "/logos/myer.png",
  "the good guys": "/logos/the-good-guys.svg",
  woolworths: "/logos/woolworths.webp",
  wish: "/logos/woolworths.webp",
};

const CHANNEL_LABEL: Record<GiftCardOffer["channel"], string> = {
  "membership-portal": "Member offer",
  "supermarket-promo": "Supermarket promo",
  "bank-benefit": "Benefits offer",
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const displayNumber = (value: number) =>
  Number.isInteger(round1(value)) ? String(round1(value)) : round1(value).toFixed(1);

function savingBadge(offer: GiftCardOffer): string {
  if (offer.promotionType === "bonus-value" && offer.bonusPercent) {
    return `${displayNumber(offer.bonusPercent)}% BONUS`;
  }
  if (offer.promotionType === "points" && offer.pointsMultiplier) {
    return `${displayNumber(offer.pointsMultiplier)}x POINTS`;
  }
  if (offer.discountPercent > 0 &&
      (offer.membershipRequired || offer.channel === "membership-portal")) {
    return `${displayNumber(offer.discountPercent)}% MEMBER RATE`;
  }
  if (offer.discountPercent > 0) {
    return `${displayNumber(offer.discountPercent)}% OFF`;
  }
  if (offer.pointsOnPurchase) return "BONUS POINTS";
  return "MEMBER OFFER";
}

function offerTitle(offer: GiftCardOffer): string {
  if (offer.promotionType === "bonus-value" && offer.bonusPercent) {
    return `${displayNumber(offer.bonusPercent)}% bonus value on ${offer.brand} gift cards`;
  }
  if (offer.promotionType === "points" && offer.pointsMultiplier) {
    return `${displayNumber(offer.pointsMultiplier)}x ${offer.pointsProgram ?? "points"} on ${offer.brand} gift cards`;
  }
  if (offer.discountPercent > 0) {
    return `${displayNumber(offer.discountPercent)}% off ${offer.brand} gift cards`;
  }
  if (offer.pointsOnPurchase) {
    return `${offer.pointsOnPurchase.program} bonus on ${offer.brand} gift cards`;
  }
  return `${offer.brand} gift card member offer`;
}

function dateLabel(value: string | null): string {
  if (!value) return "Ongoing";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Melbourne",
  }).format(new Date(`${value}T00:00:00+10:00`));
}

function logoFor(offer: GiftCardOffer): string | null {
  const candidates = [offer.brand, offer.purchaseLocation, offer.source]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  for (const candidate of candidates) {
    const exact = LOGOS[candidate];
    if (exact) return exact;
    const match = Object.entries(LOGOS).find(([name]) => candidate.includes(name));
    if (match) return match[1];
  }
  return null;
}

function initials(brand: string): string {
  return brand
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function GiftCardOfferCard({ offer }: { offer: GiftCardOffer }) {
  const logo = logoFor(offer);
  const urgency = expiryUrgencyLabelAU(offer.expiryDate);
  const seller = offer.purchaseLocation ?? offer.source;
  const verified = offer.confidence === "confirmed";
  const compatibility = isMultiRetailer(offer) ? "Multi-retailer" : "Selected retailers";

  return (
    <article className="group flex min-h-[340px] flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/35 hover:shadow-md">
      <div className="relative flex min-h-[166px] flex-[1.05] flex-col overflow-hidden border-b bg-stone-100 p-4 dark:bg-stone-900">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_1px_1px,rgba(16,185,129,0.18)_1px,transparent_0)] [background-size:18px_18px]"
        />
        <div aria-hidden className="absolute -right-12 -top-14 size-40 rounded-full bg-emerald-400/15 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          {logo ? (
            <span className="flex h-12 min-w-20 max-w-28 items-center justify-center rounded-lg border bg-white px-2 py-1 shadow-sm">
              <Image
                src={logo}
                alt={`${offer.brand} logo`}
                width={96}
                height={40}
                unoptimized
                className="max-h-9 w-auto object-contain"
              />
            </span>
          ) : (
            <span
              role="img"
              aria-label={`${offer.brand} logo treatment`}
              className="flex size-12 items-center justify-center rounded-xl bg-stone-900 text-sm font-black tracking-tight text-white shadow-sm dark:bg-white dark:text-stone-900"
            >
              {initials(offer.brand)}
            </span>
          )}
          <span className="rounded-full border border-white/70 bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-950/90 dark:text-stone-300">
            {CHANNEL_LABEL[offer.channel]}
          </span>
        </div>

        <div className="relative mt-auto flex items-end justify-between gap-2 pt-5">
          <p className="max-w-[8rem] text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
            {offer.brand} gift card
          </p>
          <div className="flex min-h-20 min-w-20 max-w-32 items-center justify-center rounded-full bg-emerald-600 px-3 text-center text-lg font-black leading-[1.05] tracking-tight text-white shadow-[0_8px_24px_rgba(5,150,105,0.25)]">
            {savingBadge(offer)}
          </div>
        </div>

        <div className="absolute bottom-3 left-3 flex gap-1.5">
          {offer.membershipRequired ? (
            <span title="Membership required" className="rounded-full bg-amber-100 p-1.5 text-amber-800">
              <LockKeyhole aria-label="Membership required" className="size-3" />
            </span>
          ) : null}
          {offer.activationRequired ? (
            <span title="Activation required" className="rounded-full bg-sky-100 p-1.5 text-sky-800">
              <Sparkles aria-label="Activation required" className="size-3" />
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 tracking-tight">
          <Link href={`/gift-cards/${offer.id}`} className="hover:text-emerald-700">
            {offerTitle(offer)}
          </Link>
        </h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">From {seller}</p>

        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarDays aria-hidden className="size-3 shrink-0" />
          <span>{dateLabel(offer.startDate)} – {dateLabel(offer.expiryDate)}</span>
          {urgency ? (
            <span className="ml-auto shrink-0 font-semibold text-amber-700 dark:text-amber-300">{urgency}</span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1",
            verified
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-sky-500/10 text-sky-700 dark:text-sky-300"
          )}>
            {verified ? <BadgeCheck className="size-3" /> : <CheckCircle2 className="size-3" />}
            {verified ? "Verified by DealStack" : "Source checked"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground">
            <Layers3 className="size-3" /> {compatibility}
          </span>
        </div>

        {offer.promotionType === "points" || offer.pointsOnPurchase ? (
          <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground">Points are rewards, not cash.</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <Link
            href={`/gift-cards/${offer.id}`}
            className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
          >
            View details
          </Link>
          {offer.acceptedAtMerchantIds[0] ? (
            <Link
              href={`/?stack=${encodeURIComponent(offer.acceptedAtMerchantIds[0])}#calculator`}
              className="inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-xs font-semibold hover:bg-muted"
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
