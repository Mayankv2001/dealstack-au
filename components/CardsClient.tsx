"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, GitCompareArrows, Landmark, SearchX, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardOfferCard } from "@/components/CardOfferCard";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { isExpiringSoonAU } from "@/lib/offers/expiry";
import type { CardOffer, CardOfferType } from "@/lib/offers/types";
import { cn } from "@/lib/utils";

/**
 * Interactive client for the public /cards page. Holds filter state only —
 * app/cards/page.tsx loads the published offers (Supabase repo with static
 * fallback) and passes them in as props. Mirrors the Deals route's
 * server/client split and Chip filter pattern.
 */

const OFFER_TYPE_FILTERS: { id: CardOfferType; label: string }[] = [
  { id: "sign_up_bonus", label: "Sign-up bonus" },
  { id: "cashback", label: "Cashback" },
  { id: "statement_credit", label: "Statement credit" },
  { id: "points_bonus", label: "Points bonus" },
  { id: "annual_fee_discount", label: "Annual fee discount" },
];

type FilterId = "all" | CardOfferType | "no-fee" | "expiring-soon" | `bank:${string}`;

function matches(offer: CardOffer, active: FilterId): boolean {
  if (active === "all") return true;
  if (active === "no-fee") return offer.annualFee === 0;
  if (active === "expiring-soon") return isExpiringSoonAU(offer.expiryDate);
  if (active.startsWith("bank:")) return offer.provider === active.slice(5);
  return offer.offerType === active;
}

function filterLabel(active: FilterId): string {
  if (active === "all") return "";
  if (active === "no-fee") return "no annual fee";
  if (active === "expiring-soon") return "expiring soon";
  if (active.startsWith("bank:")) return active.slice(5);
  return OFFER_TYPE_FILTERS.find((f) => f.id === active)?.label ?? "";
}

function Chip({
  active,
  id,
  label,
  onClick,
}: {
  active: boolean;
  id: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      key={id}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-border bg-background text-muted-foreground hover:border-emerald-500/40 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export function CardsClient({ offers }: { offers: CardOffer[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const banks = useMemo(
    () => [...new Set(offers.map((o) => o.provider))].sort(),
    [offers]
  );

  const requestedFilter = searchParams.get("filter") ?? "all";
  const active: FilterId =
    requestedFilter === "all" ||
    requestedFilter === "no-fee" ||
    requestedFilter === "expiring-soon" ||
    OFFER_TYPE_FILTERS.some((filter) => filter.id === requestedFilter) ||
    (requestedFilter.startsWith("bank:") && banks.includes(requestedFilter.slice(5)))
      ? (requestedFilter as FilterId)
      : "all";

  function setActive(next: FilterId): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("filter");
    else params.set("filter", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setSelected(id: string, selected: boolean): void {
    setSelectedIds((current) => {
      if (!selected) return current.filter((item) => item !== id);
      if (current.includes(id) || current.length >= 3) return current;
      return [...current, id];
    });
  }

  const visible = useMemo(
    () => offers.filter((o) => matches(o, active)),
    [offers, active]
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="page-container flex-1 py-7 sm:py-10">
        {/* Hero */}
        <div className="soft-panel p-5 sm:p-7">
          <div className="max-w-2xl">
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              <Landmark className="size-3" />
              Bank &amp; credit card offers
            </Badge>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              Compare card offers with the important costs visible
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Compare reviewed bonuses, annual fees, minimum spend and eligibility before opening the detail page. No application is ranked as personal financial advice.
            </p>
          </div>

          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Bonus terms, eligibility criteria and fees change without
              notice — always confirm directly with the bank before applying
              for a card.
            </span>
          </p>
        </div>

        {/* Filter chips */}
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          <Chip active={active === "all"} id="all" label="All" onClick={() => setActive("all")} />
          {OFFER_TYPE_FILTERS.map((f) => (
            <Chip
              key={f.id}
              active={active === f.id}
              id={f.id}
              label={f.label}
              onClick={() => setActive(f.id)}
            />
          ))}
          <Chip
            active={active === "no-fee"}
            id="no-fee"
            label="No annual fee"
            onClick={() => setActive("no-fee")}
          />
          <Chip
            active={active === "expiring-soon"}
            id="expiring-soon"
            label="Expiring soon"
            onClick={() => setActive("expiring-soon")}
          />
          {banks.length > 0 && (
            <>
              <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
              <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
                Banks:
              </span>
              {banks.map((bank) => (
                <Chip
                  key={bank}
                  active={active === `bank:${bank}`}
                  id={`bank:${bank}`}
                  label={bank}
                  onClick={() => setActive(`bank:${bank}`)}
                />
              ))}
            </>
          )}
        </div>

        {offers.length > 1 ? (
          <div className="mt-4 flex min-h-9 items-center justify-between gap-3 border-y py-2">
            <p className="text-xs text-muted-foreground">
              Select 2–3 cards for a side-by-side first-year comparison.
            </p>
            {selectedIds.length >= 2 ? (
              <Button asChild size="sm">
                <Link href={`/cards/compare?ids=${selectedIds.map(encodeURIComponent).join(",")}`}>
                  <GitCompareArrows />
                  Compare {selectedIds.length}
                </Link>
              </Button>
            ) : (
              <Button size="sm" disabled>
                <GitCompareArrows />
                Compare
              </Button>
            )}
          </div>
        ) : null}

        {/* Grid / empty state */}
        {visible.length === 0 ? (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border bg-card py-12 text-center shadow-sm">
            <SearchX className="size-8 text-muted-foreground" />
            <p className="font-medium">
              {offers.length === 0
                ? "No card offers published yet"
                : `No card offers match ${filterLabel(active)}`}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {offers.length === 0
                ? "Unverified, expired, or overdue offers are withheld. Browse the research guides while current issuer terms are being checked."
                : "Try another filter — new offers are added after manual review."}
            </p>
            {offers.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setActive("all")}>
                Show all
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/resources">Browse research guides</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((offer) => (
              <CardOfferCard
                key={offer.id}
                offer={offer}
                selected={selectedIds.includes(offer.id)}
                onSelectionChange={(selected) => setSelected(offer.id, selected)}
              />
            ))}
          </div>
        )}

        {/* Footer disclaimer */}
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="size-4" />
            </span>
            <h2 className="text-base font-semibold tracking-tight">
              Verify before you apply
            </h2>
          </div>
          <div className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 shadow-sm sm:p-5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong>Disclaimer:</strong> Everything on this page is general
              information, not financial advice, and not a live comparison
              feed. Bonus points, fees, minimum spend thresholds and
              eligibility rules change frequently and vary by person — always
              verify current terms directly with the bank, and consider your
              own circumstances (or talk to a licensed adviser) before
              applying for a credit card. DealStack AU is not affiliated with
              any bank or card issuer mentioned, and does not receive a
              commission for listing these offers.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export default CardsClient;
