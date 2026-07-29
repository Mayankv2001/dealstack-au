import Link from "next/link";
import type { PublicDeal } from "@/lib/deals/types";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * The redesign's remaining front-page sections: category tiles, ending-soon
 * row, latest-reviewed feed, ink programme cards and the "How we review"
 * band. Server-rendered, no client JS; every figure comes from the live
 * PublicDeal pool or counts computed in app/page.tsx — never sample data.
 */

/** Mono chip naming the offer family/programme, as in the design. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[#d5e4dd] bg-[#eef4f0] px-2.5 py-0.5 font-mono text-[11.5px] uppercase tracking-[0.06em] text-primary">
      {children}
    </span>
  );
}

export interface CategoryTile {
  name: string;
  count: number;
  desc: string;
  href: string;
}

export function CategoryTiles({ tiles }: { tiles: CategoryTile[] }) {
  return (
    <section className="page-container pt-10 sm:pt-12" aria-label="Browse by category">
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.name}
            href={tile.href}
            className="flex flex-col gap-5 rounded-xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_8px_20px_rgba(14,21,18,0.08)]"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-lg font-bold">{tile.name}</span>
              <span className="font-mono text-xs text-primary">
                {tile.count} live
              </span>
            </span>
            <span className="text-sm leading-snug text-muted-foreground">
              {tile.desc}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function EndingSoonSection({ deals }: { deals: PublicDeal[] }) {
  if (deals.length === 0) return null;
  return (
    <section className="page-container pt-11" aria-labelledby="ending-soon-heading">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="ending-soon-heading" className="text-2xl font-bold tracking-tight">
          Ending soon
        </h2>
        <Link href="/deals" className="text-sm font-semibold text-primary hover:underline">
          All deals →
        </Link>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((deal) => (
          <article
            key={deal.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-5"
          >
            <div className="flex items-center justify-between gap-2.5">
              <Chip>{deal.category}</Chip>
              <span className="font-mono text-xs text-[#9a5b12]">
                ends {formatDateAU(deal.expiryDate)}
              </span>
            </div>
            <h3 className="text-[17px] font-semibold leading-snug">
              <Link href={deal.detailPath ?? "/deals"} className="text-foreground hover:underline">
                {deal.title}
              </Link>
            </h3>
            <div className="mt-auto flex items-center justify-between gap-2.5 text-[13px]">
              <span className="font-mono text-xs text-muted-foreground">
                ✓ checked {formatDateAU(deal.lastCheckedAt?.slice(0, 10) ?? null)}
              </span>
              {deal.sourceUrl ? (
                <a
                  href={deal.sourceUrl}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="font-semibold text-primary hover:underline"
                >
                  Evidence
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LatestReviewedSection({ deals }: { deals: PublicDeal[] }) {
  if (deals.length === 0) return null;
  return (
    <section className="page-container pt-11" aria-labelledby="latest-reviewed-heading">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="latest-reviewed-heading" className="text-2xl font-bold tracking-tight">
          Latest reviewed offers
        </h2>
        <Link href="/deals?sort=latest" className="text-sm font-semibold text-primary hover:underline">
          All offers →
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {deals.map((deal) => (
          <Link
            key={deal.id}
            href={deal.detailPath ?? "/deals"}
            className="flex flex-wrap items-center gap-4 border-b border-[#efece3] px-5 py-4 text-foreground transition-colors last:border-b-0 hover:bg-[#f4f1e9]"
          >
            <Chip>{deal.category}</Chip>
            <span className="min-w-[220px] flex-1 text-[15px] font-semibold leading-snug">
              {deal.title}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              ✓ checked {formatDateAU(deal.lastCheckedAt?.slice(0, 10) ?? null)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const INK_CARDS = [
  {
    href: "/rewards/qantas-frequent-flyer",
    title: "Qantas Frequent Flyer",
    desc: "Sign-up bonuses, shopping boosts and transfer promos — reviewed with the evidence linked.",
    cta: "Every Qantas offer →",
  },
  {
    href: "/rewards/velocity-frequent-flyer",
    title: "Velocity Frequent Flyer",
    desc: "Direct Velocity offers plus Flybuys transfers, with the base rate and bonus caveat spelled out.",
    cta: "Every Velocity offer →",
  },
  {
    href: "/cards",
    title: "Credit card offers",
    desc: "Card sign-up bonuses with the annual fee, spend requirement and timing stated up front.",
    cta: "Every card offer →",
  },
] as const;

export function ProgrammeInkCards() {
  return (
    <section className="page-container pt-11" aria-label="Programmes">
      <div className="grid gap-3.5 lg:grid-cols-3">
        {INK_CARDS.map((card) => (
          <div
            key={card.href}
            className="flex flex-col gap-3.5 rounded-xl bg-[#0e1512] p-7 text-[#f7f5f0]"
          >
            <h2 className="font-heading text-xl font-bold">{card.title}</h2>
            <p className="text-sm leading-relaxed text-[#b9bdb8]">{card.desc}</p>
            <Link
              href={card.href}
              className="mt-auto text-sm font-semibold text-[#f7f5f0] hover:underline"
            >
              {card.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

const REVIEW_STEPS = [
  ["01 — VERIFY", "A person confirms every offer at the source before it is listed, and re-checks it on a schedule."],
  ["02 — EVIDENCE", "Each listing links to the public source of the offer terms, so you can see exactly what we saw."],
  ["03 — HONEST VALUE", "Points are rewards, not cash — estimated value is shown separately, never subtracted from the price."],
] as const;

export function HowWeReview() {
  return (
    <section className="page-container py-11" aria-labelledby="how-we-review-heading">
      <div className="rounded-xl border border-dashed border-[#c9c4b6] bg-card p-7">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id="how-we-review-heading" className="font-heading text-xl font-bold">
            How we review
          </h2>
          <Link href="/editorial-policy" className="text-sm font-semibold text-primary hover:underline">
            Editorial policy
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {REVIEW_STEPS.map(([label, copy]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="font-mono text-xs text-primary">{label}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {copy}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
