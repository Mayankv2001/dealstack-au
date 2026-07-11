import Link from "next/link";
import { ArrowRight, Copy, ExternalLink, Layers3, MessageSquare } from "lucide-react";
import StoreLogo from "@/components/StoreLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Store } from "@/lib/data";
import type { DealGroup, PublicDeal } from "@/lib/deals/types";
import { formatAUD } from "@/lib/calculateStack";
import { DealFreshness } from "./DealFreshness";
import { DealConditionBadges, DealStatusBadge } from "./DealStatusBadge";

function DealPrice({ deal }: { deal: PublicDeal }) {
  if (!deal.priceText && deal.savingPercent == null) {
    return <p className="text-sm font-semibold text-muted-foreground">See offer for price</p>;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      {deal.priceText ? (
        <p className="text-lg font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
          {deal.priceText}
        </p>
      ) : null}
      {deal.savingPercent != null ? (
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          {deal.savingPercent}% saving
        </span>
      ) : null}
    </div>
  );
}

export function DealCard({
  deal,
  stores,
  now,
  compact = false,
}: {
  deal: PublicDeal;
  stores: Store[];
  now: Date;
  compact?: boolean;
}) {
  const store = deal.merchantId
    ? stores.find((candidate) => candidate.id === deal.merchantId)
    : undefined;
  const href = deal.detailPath ?? deal.sourceUrl;
  const external = href?.startsWith("http") ?? false;
  const visibleTags = deal.tags.slice(0, 3);

  return (
    <Card className="h-full gap-0 py-0 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <StoreLogo
            store={store}
            text={deal.merchantName?.slice(0, 2).toUpperCase() ?? deal.sourceName.slice(0, 2).toUpperCase()}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {deal.merchantName ?? deal.sourceName}
            </p>
            <h3 className="mt-0.5 line-clamp-2 font-semibold leading-snug">
              {deal.title}
            </h3>
          </div>
          <DealStatusBadge trust={deal.trust} className="hidden shrink-0 sm:inline-flex" />
        </div>

        <div className="sm:hidden">
          <DealStatusBadge trust={deal.trust} />
        </div>
        <DealPrice deal={deal} />
        {!compact && deal.summary ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {deal.summary}
          </p>
        ) : null}

        {visibleTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleTags.map((tag) => (
              <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tag}
              </span>
            ))}
            {deal.tags.length > visibleTags.length ? (
              <span className="px-1 py-0.5 text-[10px] text-muted-foreground">
                +{deal.tags.length - visibleTags.length}
              </span>
            ) : null}
          </div>
        ) : null}

        {deal.couponCode ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Copy aria-hidden className="size-3.5" />
            Code <code className="rounded bg-muted px-1.5 py-0.5 font-semibold text-foreground">{deal.couponCode}</code>
          </p>
        ) : null}

        <DealConditionBadges deal={deal} now={now} />
        <DealFreshness deal={deal} now={now} className="mt-auto border-t pt-3" />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {deal.stackable ? <span className="inline-flex items-center gap-1"><Layers3 aria-hidden className="size-3" /> Stackable</span> : null}
            {deal.comments != null ? <span className="inline-flex items-center gap-1"><MessageSquare aria-hidden className="size-3" /> {deal.comments}</span> : null}
          </div>
          {href ? (
            <Button asChild size="sm" variant={deal.detailPath ? "default" : "outline"}>
              {external ? (
                <a href={href} target="_blank" rel="nofollow noopener noreferrer">
                  Go to offer <ExternalLink aria-hidden />
                </a>
              ) : (
                <Link href={href}>
                  See details <ArrowRight aria-hidden />
                </Link>
              )}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Source unavailable</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DealGroupCard({ group, now }: { group: DealGroup; now: Date }) {
  return (
    <Card className="h-full gap-0 py-0 shadow-sm">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Compare retailers</p>
          <h3 className="mt-1 text-lg font-semibold leading-snug">{group.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {group.fromPrice != null ? `From ${formatAUD(group.fromPrice)} · ` : ""}{group.options.length} active offers
          </p>
        </div>
        <div className="divide-y rounded-lg border">
          {group.options.slice(0, 4).map((option) => (
            <div key={option.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium">{option.merchantName ?? option.sourceName}</span>
              <span className="shrink-0 text-sm font-semibold">{option.priceValue != null ? formatAUD(option.priceValue) : "See price"}</span>
            </div>
          ))}
        </div>
        <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
          Compare seller, model and eligibility conditions before purchasing.
        </p>
        <DealFreshness deal={group.options[0]} now={now} />
      </CardContent>
    </Card>
  );
}
