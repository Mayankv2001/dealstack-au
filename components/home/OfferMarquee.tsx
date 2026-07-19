"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { formatAUD } from "@/lib/calculateStack";
import type { MarqueeSlide } from "@/lib/giftcards/marquee";
import { cn } from "@/lib/utils";

/**
 * The homepage gift-card carousel. This week's current offers render as a
 * responsive, paged carousel — three cards at a time on desktop, two on tablet,
 * one on mobile — grouped into pages of that many. Previous/next move by a whole
 * page; the counter and dots track PAGES (e.g. "1 / 6"), not individual offers.
 *
 * Client island; every string arrives pre-derived from lib/giftcards/marquee.ts
 * so the carousel can never disagree with the /gift-cards grid. Native CSS
 * scroll-snap drives the track, so touch/trackpad swipe works for free and the
 * current page is read back from scroll position. No autoplay — navigation is
 * user-driven, which is calmer for a three-up layout and reduced-motion safe.
 */

const TONE_CHIP: Record<MarqueeSlide["compatibilityTone"], string> = {
  positive: "border-transparent bg-emerald-400/15 text-emerald-200",
  warning: "border-transparent bg-amber-400/15 text-amber-300",
  negative: "border-transparent bg-red-400/15 text-red-300",
  neutral: "border-emerald-100/20 text-emerald-100/70",
};

/** Cards visible at once, matching the Tailwind breakpoints used on the track. */
function useCardsPerView(): number {
  const [perView, setPerView] = useState(1);
  useEffect(() => {
    const lg = window.matchMedia("(min-width: 1024px)");
    const sm = window.matchMedia("(min-width: 640px)");
    const sync = () => setPerView(lg.matches ? 3 : sm.matches ? 2 : 1);
    sync();
    lg.addEventListener("change", sync);
    sm.addEventListener("change", sync);
    return () => {
      lg.removeEventListener("change", sync);
      sm.removeEventListener("change", sync);
    };
  }, []);
  return perView;
}

function OfferCard({ slide }: { slide: MarqueeSlide }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-emerald-100/15 bg-emerald-950/45 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-serif text-4xl font-bold leading-none tracking-[-0.03em] text-emerald-200">
          {slide.valueBadge}
        </p>
        {slide.urgencyLabel ? (
          <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-bold text-amber-300">
            {slide.urgencyLabel}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-emerald-100/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-100/70">
            {slide.dateLabel}
          </span>
        )}
      </div>

      <p className="mt-3 text-lg font-bold leading-snug">
        {slide.brandPrimary}
        {slide.brandSecondary ? (
          <span className="ml-2 rounded-full bg-emerald-100/10 px-2 py-0.5 align-middle text-[11px] font-semibold text-emerald-100/70">
            {slide.brandSecondary}
          </span>
        ) : null}
      </p>

      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.1em] text-emerald-300">
        {slide.mechanicLabel}
        <span className="font-semibold normal-case tracking-normal text-emerald-100/60">
          {" "}
          · {slide.sellerLabel}
          {slide.sourceLabel ? ` · via ${slide.sourceLabel}` : ""}
        </span>
      </p>

      {slide.isRewardOnly ? (
        <p className="mt-3 text-xs leading-relaxed text-emerald-100/60">
          {slide.example?.points != null
            ? `≈ ${slide.example.points.toLocaleString("en-AU")} pts on ${formatAUD(
                slide.example.faceValue,
              )} — rewards, not cash. Your price is unchanged.`
            : "Points are rewards, not cash — the price you pay is unchanged."}
        </p>
      ) : slide.example ? (
        <p className="mt-3 text-xs leading-relaxed text-emerald-100/70">
          On {formatAUD(slide.example.faceValue)} you pay{" "}
          <span className="font-bold text-emerald-300">
            {formatAUD(slide.example.cashPaid)}
          </span>{" "}
          — save {formatAUD(slide.example.saving)}.
        </p>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-emerald-100/60">
          {slide.caveat}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span className="rounded-full border border-emerald-100/20 px-2.5 py-1 text-emerald-200">
          {slide.trustLabel}
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1",
            TONE_CHIP[slide.compatibilityTone],
          )}
        >
          {slide.compatibilityLabel}
        </span>
      </div>

      <div className="mt-auto pt-4">
        <Link
          href={slide.detailHref}
          className="inline-flex items-center gap-1 text-sm font-black text-emerald-300 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          See this offer
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </article>
  );
}

export function OfferMarquee({
  slides,
  liveCount,
}: {
  slides: MarqueeSlide[];
  liveCount: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const perView = useCardsPerView();
  const [scrollPage, setScrollPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(slides.length / perView));
  // Clamp during render so a breakpoint change (fewer pages) can never leave a
  // stale out-of-range page — no state-syncing effect required.
  const page = Math.min(scrollPage, pageCount - 1);

  // Read the current page back from scroll position (also handles swipe).
  const syncPage = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    setScrollPage((current) => (current === next ? current : next));
  }, []);

  const goToPage = useCallback((next: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(
      0,
      Math.min(next, Math.max(0, Math.ceil(track.scrollWidth / track.clientWidth) - 1)),
    );
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }, []);

  if (slides.length === 0) return null;

  const atStart = page <= 0;
  const atEnd = page >= pageCount - 1;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="This week's gift-card offers"
      className="border-b border-foreground/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 text-emerald-50"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goToPage(page + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          goToPage(page - 1);
        }
      }}
    >
      <div className="page-container py-6 sm:py-8">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
            This week&rsquo;s gift-card offers
          </h2>
          <p className="text-xs text-emerald-100/60">
            Wednesday cycle · reviewed before publication · ordered by ending soonest
          </p>
        </div>

        <div className="mt-5 grid items-center gap-3 lg:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]">
          <button
            type="button"
            aria-label="Previous offers"
            disabled={atStart}
            onClick={() => goToPage(page - 1)}
            className="hidden size-11 items-center justify-center rounded-full border border-emerald-100/20 transition hover:bg-emerald-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-30 lg:flex"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>

          <div
            ref={trackRef}
            onScroll={syncPage}
            role="group"
            aria-label={`Offers, page ${page + 1} of ${pageCount}`}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {slides.map((slide) => (
              <div
                key={slide.id}
                className="min-w-0 shrink-0 grow-0 basis-full snap-start sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)]"
              >
                <OfferCard slide={slide} />
              </div>
            ))}
          </div>

          <button
            type="button"
            aria-label="Next offers"
            disabled={atEnd}
            onClick={() => goToPage(page + 1)}
            className="hidden size-11 items-center justify-center rounded-full border border-emerald-100/20 transition hover:bg-emerald-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-30 lg:flex"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-emerald-100/15 pt-4">
          {pageCount > 1 ? (
            <>
              <div className="flex gap-1.5 lg:hidden">
                <button
                  type="button"
                  aria-label="Previous offers"
                  disabled={atStart}
                  onClick={() => goToPage(page - 1)}
                  className="flex size-9 items-center justify-center rounded-full border border-emerald-100/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-30"
                >
                  <ChevronLeft aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next offers"
                  disabled={atEnd}
                  onClick={() => goToPage(page + 1)}
                  className="flex size-9 items-center justify-center rounded-full border border-emerald-100/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-30"
                >
                  <ChevronRight aria-hidden className="size-4" />
                </button>
              </div>
              <div
                role="tablist"
                aria-label="Carousel pages"
                className="flex items-center gap-1.5"
              >
                {Array.from({ length: pageCount }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-label={`Go to page ${i + 1} of ${pageCount}`}
                    aria-selected={i === page}
                    onClick={() => goToPage(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
                      i === page
                        ? "w-6 bg-emerald-300"
                        : "w-1.5 bg-emerald-100/25 hover:bg-emerald-100/50",
                    )}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-emerald-100/60 [font-variant-numeric:tabular-nums]">
                {page + 1} / {pageCount}
              </span>
            </>
          ) : null}
          <Link
            href="/gift-cards"
            className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-emerald-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            All {liveCount} reviewed offers
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default OfferMarquee;
