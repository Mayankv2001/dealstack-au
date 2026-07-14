"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { formatAUD } from "@/lib/calculateStack";
import type { MarqueeSlide } from "@/lib/giftcards/marquee";
import { cn } from "@/lib/utils";

/**
 * The offer marquee ("Design 3"): this week's live gift-card offers play as a
 * slideshow, one after another, ordered by ending soonest — so the sequence
 * itself is a countdown. Client island; all content arrives pre-derived from
 * lib/giftcards/marquee.ts.
 *
 * Motion rules: auto-advance ~6s with story-style timer bars; pauses on
 * hover, focus-within, user toggle and hidden tabs; pausing FREEZES the
 * current bar exactly where it is (progress accumulates via delta time, so
 * resuming continues rather than restarting); under prefers-reduced-motion
 * there is no autoplay and the current bar renders full as a static position
 * marker. Arrow keys work only while focus is inside the region.
 */

const SLIDE_MS = 6000;

const TONE_CHIP: Record<MarqueeSlide["compatibilityTone"], string> = {
  positive: "border-transparent bg-emerald-400/15 text-emerald-200",
  warning: "border-transparent bg-amber-400/15 text-amber-300",
  negative: "border-transparent bg-red-400/15 text-red-300",
  neutral: "border-emerald-100/20 text-emerald-100/70",
};

/** prefers-reduced-motion, SSR-safe (false on the server). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** document.hidden, SSR-safe (false on the server). */
function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => document.hidden,
    () => false,
  );
}

export function OfferMarquee({
  slides,
  liveCount,
}: {
  slides: MarqueeSlide[];
  liveCount: number;
}) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const docHidden = useDocumentHidden();
  const reduced = useReducedMotion();
  const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  /** 0..1 progress through the CURRENT slide; frozen while paused. */
  const progressRef = useRef(0);
  const paused = userPaused || hoverPaused || focusPaused || docHidden || reduced;

  const goTo = useCallback(
    (next: number) => {
      const total = slides.length;
      if (total === 0) return;
      progressRef.current = 0;
      setIndex(((next % total) + total) % total);
    },
    [slides.length],
  );

  // Static bar states. The running bar is driven by the rAF loop; a paused
  // bar keeps whatever width it had (progressRef is the source of truth).
  useEffect(() => {
    fillRefs.current.forEach((fill, i) => {
      if (!fill) return;
      if (i < index) fill.style.width = "100%";
      else if (i > index) fill.style.width = "0%";
      else if (reduced) fill.style.width = "100%";
      else fill.style.width = `${progressRef.current * 100}%`;
    });
  }, [index, reduced]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    let raf: number;
    let last: number | null = null;
    const step = (ts: number) => {
      if (last === null) last = ts;
      progressRef.current = Math.min(
        progressRef.current + (ts - last) / SLIDE_MS,
        1,
      );
      last = ts;
      const fill = fillRefs.current[index];
      if (fill) fill.style.width = `${progressRef.current * 100}%`;
      if (progressRef.current >= 1) {
        goTo(index + 1);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused, index, slides.length, goTo]);

  if (slides.length === 0) return null;
  const active = slides[index] ?? slides[0];

  return (
    <section
      aria-label="This week's gift-card offers"
      className="border-b border-foreground/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 text-emerald-50"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setFocusPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusPaused(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goTo(index + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          goTo(index - 1);
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

        {slides.length > 1 ? (
          <div
            role="group"
            aria-label="Choose an offer slide"
            className="mt-4 flex gap-1.5"
          >
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Show offer ${i + 1} of ${slides.length}: ${slide.brandPrimary}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className="group flex-1 rounded-full py-2 outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                <span className="block h-1 overflow-hidden rounded-full bg-emerald-100/20">
                  <span
                    ref={(el) => {
                      fillRefs.current[i] = el;
                    }}
                    className={cn(
                      "block h-full w-0 rounded-full bg-emerald-300",
                      i < index && "opacity-50",
                    )}
                  />
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid items-center gap-4 lg:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]">
          <button
            type="button"
            aria-label="Previous offer"
            onClick={() => goTo(index - 1)}
            className="hidden size-11 items-center justify-center rounded-full border border-emerald-100/20 transition hover:bg-emerald-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 lg:flex"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>

          <div className="grid min-h-64 items-center gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
            <article
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}`}
            >
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-300">
                {active.mechanicLabel}
                <span className="font-semibold normal-case tracking-normal text-emerald-100/60">
                  {" "}
                  · {active.sellerLabel}
                  {active.sourceLabel ? ` · via ${active.sourceLabel}` : ""}
                </span>
              </p>
              <p className="mt-2 font-serif text-6xl font-bold leading-none tracking-[-0.04em] text-emerald-200 sm:text-7xl">
                {active.valueBadge}
              </p>
              <p className="mt-3 text-xl font-bold sm:text-2xl">
                {active.brandPrimary}
                {active.brandSecondary ? (
                  <span className="ml-2 rounded-full bg-emerald-100/10 px-2 py-0.5 align-middle text-xs font-semibold text-emerald-100/70">
                    {active.brandSecondary}
                  </span>
                ) : null}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                {active.urgencyLabel ? (
                  <span className="rounded-full bg-amber-400/15 px-3 py-1 text-amber-300">
                    {active.urgencyLabel}
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-100/20 px-3 py-1 text-emerald-100/70">
                    {active.dateLabel}
                  </span>
                )}
                <span className="rounded-full border border-emerald-100/20 px-3 py-1 text-emerald-200">
                  {active.trustLabel}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1",
                    TONE_CHIP[active.compatibilityTone],
                  )}
                >
                  {active.compatibilityLabel}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link
                  href={active.detailHref}
                  className="rounded-xl bg-emerald-300 px-5 py-2.5 text-sm font-black text-emerald-950 transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
                >
                  See this offer
                </Link>
                <Link
                  href="/gift-cards"
                  className="rounded-xl border border-emerald-100/25 px-4 py-2.5 text-sm font-bold text-emerald-50 transition hover:bg-emerald-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  All gift-card offers
                </Link>
              </div>
            </article>

            <aside
              aria-label="Worked example"
              className="hidden rounded-2xl border border-emerald-100/15 bg-emerald-950/55 p-5 text-sm md:block"
            >
              <h3 className="text-[11px] font-black uppercase tracking-[0.1em] text-emerald-100/60">
                {active.isRewardOnly
                  ? "Rewards, kept separate"
                  : `The maths, on ${formatAUD(active.example?.faceValue ?? 100)}`}
              </h3>
              <dl className="mt-2 [font-variant-numeric:tabular-nums]">
                {active.isRewardOnly ? (
                  <>
                    <div className="flex justify-between border-b border-dashed border-emerald-100/15 py-1.5">
                      <dt>Cash price</dt>
                      <dd className="font-bold">unchanged</dd>
                    </div>
                    {active.example?.points != null ? (
                      <div className="flex justify-between border-b border-dashed border-emerald-100/15 py-1.5">
                        <dt>Points on {formatAUD(active.example.faceValue)}</dt>
                        <dd className="font-bold text-emerald-300">
                          +{active.example.points.toLocaleString("en-AU")} pts
                        </dd>
                      </div>
                    ) : null}
                    {active.example?.rewardValueDollars != null &&
                    active.example.pointValueCents != null ? (
                      <div className="flex justify-between py-1.5">
                        <dt>Est. value @ {active.example.pointValueCents}¢/pt</dt>
                        <dd className="font-bold text-emerald-300">
                          ≈ {formatAUD(active.example.rewardValueDollars)} — not cash
                        </dd>
                      </div>
                    ) : null}
                  </>
                ) : active.example ? (
                  <>
                    <div className="flex justify-between border-b border-dashed border-emerald-100/15 py-1.5">
                      <dt>Face value</dt>
                      <dd>{formatAUD(active.example.faceValue)}</dd>
                    </div>
                    <div className="flex justify-between border-b border-dashed border-emerald-100/15 py-1.5">
                      <dt>You pay</dt>
                      <dd className="font-bold text-emerald-300">
                        {formatAUD(active.example.cashPaid)}
                      </dd>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <dt>Immediate saving</dt>
                      <dd className="font-bold text-emerald-300">
                        {formatAUD(active.example.saving)}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-emerald-100/60">
                {active.caveat}
              </p>
            </aside>
          </div>

          <button
            type="button"
            aria-label="Next offer"
            onClick={() => goTo(index + 1)}
            className="hidden size-11 items-center justify-center rounded-full border border-emerald-100/20 transition hover:bg-emerald-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 lg:flex"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-emerald-100/15 pt-4">
          {slides.length > 1 ? (
            <>
              <button
                type="button"
                aria-label={userPaused ? "Play slideshow" : "Pause slideshow"}
                aria-pressed={userPaused}
                onClick={() => setUserPaused((value) => !value)}
                className="flex size-9 items-center justify-center rounded-full border border-emerald-100/20 transition hover:bg-emerald-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                {userPaused ? (
                  <Play aria-hidden className="size-3.5" />
                ) : (
                  <Pause aria-hidden className="size-3.5" />
                )}
              </button>
              <div className="flex gap-1 lg:hidden">
                <button
                  type="button"
                  aria-label="Previous offer"
                  onClick={() => goTo(index - 1)}
                  className="flex size-9 items-center justify-center rounded-full border border-emerald-100/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  <ChevronLeft aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next offer"
                  onClick={() => goTo(index + 1)}
                  className="flex size-9 items-center justify-center rounded-full border border-emerald-100/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  <ChevronRight aria-hidden className="size-4" />
                </button>
              </div>
              <span className="text-xs font-semibold text-emerald-100/60 [font-variant-numeric:tabular-nums]">
                {index + 1} / {slides.length}
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
