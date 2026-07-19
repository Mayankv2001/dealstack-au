import Link from "next/link";
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import StoreLogo from "@/components/StoreLogo";
import { LayerFactChips, layerEntries } from "@/components/deals/LayerFacts";
import { Card, CardContent } from "@/components/ui/card";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import {
  ROLE_LABEL,
  type DealRecommendation,
} from "@/lib/deals/recommend";
import { publicFreshness } from "@/lib/freshness";
import { isVerifiedStackLayer } from "@/lib/stack/present";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * The top-recommendations strip for a purchase-intent /deals request: at most
 * three routes in fixed role order (best verified → lowest checkout → best
 * alternative). Each card answers the purchase questions in place — checkout
 * price, later cashback, points kept separate, per-layer states with reasons,
 * expiry and verification dates — with ONE primary action and native
 * disclosures for the rest. No planner hop required.
 */

function RecommendationCard({
  item,
  stores,
  spend,
  now,
}: {
  item: DealRecommendation;
  stores: Store[];
  spend: number;
  now: Date;
}) {
  const store = stores.find((candidate) => candidate.id === item.merchantId);
  const rec = item.recommendation;
  const deal = item.deal;
  const anchored = item.listedPrice != null;
  const href = deal?.sourceUrl ?? deal?.detailPath ?? `/stores/${item.merchantId}`;
  const external = href.startsWith("http");
  const actionLabel = deal?.sourceUrl
    ? "Open retailer"
    : deal?.detailPath
      ? "View deal"
      : "Store offers";
  const freshness = rec?.checkedAsOf
    ? publicFreshness(rec.checkedAsOf, now)
    : null;
  const conditions = rec?.warnings ?? [];
  const layers = rec?.components ?? [];

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex h-full flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.roles.map((role) => (
            <span
              key={role}
              className={
                role === "best-verified"
                  ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300"
                  : "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold text-muted-foreground"
              }
            >
              {role === "best-verified" ? (
                <ShieldCheck aria-hidden className="size-3" />
              ) : null}
              {ROLE_LABEL[role]}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <StoreLogo
            store={store}
            text={item.merchantName.slice(0, 2).toUpperCase()}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {item.merchantName}
            </p>
            {deal ? (
              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                {deal.title}
              </p>
            ) : rec ? (
              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                {rec.title}
              </p>
            ) : null}
          </div>
        </div>

        {/* Money block: checkout price first, later value clearly separate. */}
        <div className="rounded-lg border bg-muted/40 p-3">
          {anchored ? (
            <p className="text-[11px] text-muted-foreground">
              Listed {formatAUD(item.listedPrice!)}
              {deal?.wasPrice ? ` (was ${formatAUD(deal.wasPrice)})` : ""}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No listed price — figures use a {formatAUD(spend)} example spend
            </p>
          )}
          <p className="mt-0.5 text-xl font-bold tracking-tight">
            {formatAUD(item.payAtCheckout)}
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              pay at checkout
            </span>
          </p>
          <div className="mt-1 space-y-0.5 text-[11px] leading-snug">
            {item.cashbackLater > 0 ? (
              <p className="font-medium text-emerald-800 dark:text-emerald-300">
                + {formatAUD(item.cashbackLater)} cashback received later
              </p>
            ) : null}
            {rec && rec.pointsEarned > 0 ? (
              <p className="inline-flex items-center gap-1 text-muted-foreground">
                <Sparkles aria-hidden className="size-3 text-amber-500" />~
                {rec.pointsEarned.toLocaleString("en-AU")} pts
                {rec.pointsValueDollars > 0
                  ? ` (est. ${formatAUD(rec.pointsValueDollars)} — not cash)`
                  : " (not cash)"}
              </p>
            ) : null}
            {rec ? (
              <p className="text-muted-foreground">
                {item.verifiedSaving > 0
                  ? `${formatAUD(item.verifiedSaving)} of the saving is verified`
                  : "No layer is verified yet — confirm each at its source"}
                {item.totalSaving > item.verifiedSaving
                  ? ` · up to ${formatAUD(item.totalSaving)} total`
                  : ""}
              </p>
            ) : (
              <p className="text-muted-foreground">
                No stackable saving layer on file — listed price applies.
              </p>
            )}
          </div>
        </div>

        {item.facts ? <LayerFactChips facts={item.facts} /> : null}

        {rec && layers.length > 0 ? (
          <details className="group/why">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              Why this stack
              <ChevronDown
                aria-hidden
                className="size-3 transition-transform group-open/why:rotate-180"
              />
            </summary>
            <ul className="mt-1 space-y-1 text-[11px] leading-snug text-muted-foreground">
              {layers.map((component, index) => (
                <li key={`${component.layer}-${index}`}>
                  <span className="font-medium text-foreground">
                    {component.label}
                  </span>{" "}
                  — {isVerifiedStackLayer(component) ? "verified" : "unverified"}
                  {component.optional ? " · alternative, not combined" : ""}
                  {component.note ? ` · ${component.note}` : ""}
                </li>
              ))}
              {item.facts
                ? layerEntries(item.facts)
                    .filter(({ fact }) => fact.reason)
                    .map(({ key, fact }) => (
                      <li key={`reason-${key}`}>
                        <span className="font-medium text-foreground">
                          {fact.label}:
                        </span>{" "}
                        {fact.reason}
                      </li>
                    ))
                : null}
            </ul>
          </details>
        ) : null}

        {conditions.length > 0 ? (
          <details className="group/conditions">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400 [&::-webkit-details-marker]:hidden">
              Conditions ({conditions.length})
              <ChevronDown
                aria-hidden
                className="size-3 transition-transform group-open/conditions:rotate-180"
              />
            </summary>
            <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-muted-foreground">
              {conditions.map((warning) => (
                <li key={`${warning.code}-${warning.message}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
          <p className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <CalendarClock aria-hidden className="size-3" />
            {freshness ? `${freshness.label}` : "Check date not recorded"}
            {rec?.soonestExpiry
              ? ` · expires ${formatDateAU(rec.soonestExpiry)}`
              : deal?.expiryDate
                ? ` · expires ${formatDateAU(deal.expiryDate)}`
                : ""}
          </p>
          {external ? (
            <a
              href={href}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              {actionLabel} <ExternalLink aria-hidden className="size-3" />
            </a>
          ) : (
            <Link
              href={href}
              className="inline-flex h-8 shrink-0 items-center rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              {actionLabel}
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DealRecommendations({
  items,
  stores,
  spend,
  now,
}: {
  items: DealRecommendation[];
  stores: Store[];
  spend: number;
  now: Date;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="top-recommendations" className="mb-6">
      <h2 id="top-recommendations" className="text-lg font-bold">
        Top ways to buy
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Checkout price, later cashback and points are shown separately. Points
        and unverified layers never reduce the checkout price.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <RecommendationCard
            key={`${item.merchantId}-${item.roles[0]}`}
            item={item}
            stores={stores}
            spend={spend}
            now={now}
          />
        ))}
      </div>
    </section>
  );
}

export default DealRecommendations;
