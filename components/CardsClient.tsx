"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Landmark, SearchX, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardOfferCard } from "@/components/CardOfferCard";
import Logo from "@/components/Logo";
import type { CardOffer, CardOfferType } from "@/lib/offers/types";
import { cn } from "@/lib/utils";

/**
 * Interactive client for the public /cards page. Holds filter state only —
 * app/cards/page.tsx loads the published offers (Supabase repo with static
 * fallback) and passes them in as props. Mirrors components/DealsClient.tsx's
 * server/client split and Chip filter pattern.
 */

const EXPIRY_SOON_MS = 7 * 24 * 60 * 60 * 1000;

const OFFER_TYPE_FILTERS: { id: CardOfferType; label: string }[] = [
  { id: "sign_up_bonus", label: "Sign-up bonus" },
  { id: "cashback", label: "Cashback" },
  { id: "statement_credit", label: "Statement credit" },
  { id: "points_bonus", label: "Points bonus" },
  { id: "annual_fee_discount", label: "Annual fee discount" },
];

type FilterId = "all" | CardOfferType | "no-fee" | "expiring-soon" | `bank:${string}`;

function isExpiringSoon(expiry: string | null): boolean {
  if (!expiry) return false;
  const diff = new Date(`${expiry}T23:59:59+10:00`).getTime() - Date.now();
  return diff >= 0 && diff <= EXPIRY_SOON_MS;
}

function matches(offer: CardOffer, active: FilterId): boolean {
  if (active === "all") return true;
  if (active === "no-fee") return offer.annualFee === 0;
  if (active === "expiring-soon") return isExpiringSoon(offer.expiryDate);
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
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-border bg-background text-muted-foreground hover:border-emerald-500/40 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export function CardsClient({ offers }: { offers: CardOffer[] }) {
  const [active, setActive] = useState<FilterId>("all");

  const banks = useMemo(
    () => [...new Set(offers.map((o) => o.provider))].sort(),
    [offers]
  );

  const visible = useMemo(
    () => offers.filter((o) => matches(o, active)),
    [offers, active]
  );

  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link href="/">Stores</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/deals">Deals</Link>
            </Button>
            <span
              aria-current="page"
              className="inline-flex h-8 items-center rounded-md bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
            >
              Cards
            </span>
            <Button asChild size="sm" variant="ghost">
              <Link href="/resources">Resources</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Hero */}
        <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 shadow-sm sm:p-5">
          <div className="max-w-2xl">
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              <Landmark className="size-3" />
              Bank &amp; credit card offers
            </Badge>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Card{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                offers
              </span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Every offer here is{" "}
              <span className="font-medium text-foreground">
                manually entered and reviewed by a person
              </span>
              , never auto-scraped — each card shows when it was last checked.
              Always confirm current terms with the bank before applying.
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

        {/* Grid / empty state */}
        {visible.length === 0 ? (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border bg-card py-12 text-center shadow-sm">
            <SearchX className="size-8 text-muted-foreground" />
            <p className="font-medium">
              {offers.length === 0
                ? "No card offers published yet"
                : `No ${filterLabel(active)} card offers right now`}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {offers.length === 0
                ? "Check back soon — new offers are added after manual review."
                : "Try another filter — new offers are added after manual review."}
            </p>
            {offers.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setActive("all")}>
                Show all
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((offer) => (
              <CardOfferCard key={offer.id} offer={offer} />
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
    </div>
  );
}

export default CardsClient;
