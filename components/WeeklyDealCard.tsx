import {
  BadgePercent,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  ExternalLink,
  Flame,
  FlaskConical,
  Gift,
  type LucideIcon,
  MessageSquare,
  RefreshCw,
  Star,
  Store as StoreIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  SOURCE_META,
  type Citation,
  type Confidence,
  type DealKind,
  type SourceId,
} from "@/lib/sources/types";
import { cn } from "@/lib/utils";

/**
 * Card for a single weekly deal/offer. One normalised `WeeklyDealCardData`
 * drives several layouts via `variant`:
 *   - "default"  curated picks (compact summary)
 *   - "giftcard" GCDB-style: prominent CSS-only discount/points badge tile
 *   - "points"   FreePoints-style: program badge + big points figure
 *   - "signal"   OzBargain-style: compact community feed row
 *
 * Presentation only — no data fetching, no network, no external images.
 */

export type WeeklyDealTone =
  | "emerald"
  | "violet"
  | "amber"
  | "rose"
  | "orange"
  | "sky";

export type WeeklyDealVariant = "default" | "giftcard" | "points" | "signal";

export interface WeeklyDealCardData {
  kind: DealKind;
  category: string;
  title: string;
  summary: string;
  /** Merchant name or gift card source. */
  subject?: string | null;
  /** Headline value for the default variant, e.g. "5% off". */
  highlight?: string | null;
  tone?: WeeklyDealTone;
  icon?: LucideIcon;
  variant?: WeeklyDealVariant;
  /** Big CSS-only badge tile (gift card / points variants). */
  badge?: { value: string; caption?: string };
  /** Points program name, drives the program badge (points variant). */
  program?: string | null;
  /** Community votes (signal variant). */
  votes?: number | null;
  /** Community comment count (signal variant). */
  comments?: number | null;
  /** Short tag labels (signal variant). */
  tags?: string[];
  /** Community-posted promo code (signal variant). */
  promoCode?: string | null;
  /** Short price/discount text (signal variant). */
  priceText?: string | null;
  /** Exact OzBargain post URL for the "View OzBargain signal" button. */
  sourceUrl?: string | null;
  /** Retailer/product destination for the optional "View retailer" button. */
  retailerUrl?: string | null;
  /** True when this is static sample data — links are not rendered live. */
  isSample?: boolean;
  /** Posted date ISO (signal variant). */
  postedAt?: string | null;
  /** GCDB-style practical facts shown as a compact grid (giftcard variant). */
  details?: { label: string; value: string }[];
  /** Collapsible usage notes (giftcard variant). */
  usageNotes?: string[];
  /** Collapsible stacking notes (giftcard variant). */
  stackNotes?: string[];
  /** Link to a fuller offer-detail page at the source. */
  detailUrl?: string | null;
  expiryDate: string | null;
  expiringSoon?: boolean;
  lastCheckedAt?: string | null;
  confidence: Confidence;
  citations: Citation[];
}

const toneStyles: Record<WeeklyDealTone, { tile: string; text: string; grad: string }> = {
  emerald: {
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
    grad: "from-emerald-500/15 to-emerald-500/[0.03]",
  },
  violet: {
    tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    text: "text-violet-700 dark:text-violet-400",
    grad: "from-violet-500/15 to-violet-500/[0.03]",
  },
  amber: {
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    grad: "from-amber-500/15 to-amber-500/[0.03]",
  },
  rose: {
    tile: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    text: "text-rose-700 dark:text-rose-400",
    grad: "from-rose-500/15 to-rose-500/[0.03]",
  },
  orange: {
    tile: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    text: "text-orange-700 dark:text-orange-400",
    grad: "from-orange-500/15 to-orange-500/[0.03]",
  },
  sky: {
    tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    text: "text-sky-700 dark:text-sky-400",
    grad: "from-sky-500/15 to-sky-500/[0.03]",
  },
};

const kindIcons: Record<DealKind, LucideIcon> = {
  "discount-code": BadgePercent,
  cashback: CreditCard,
  "gift-card": Gift,
  points: Star,
  guide: StoreIcon,
};

/** Subtle per-source tints so citations are recognisable at a glance. */
const sourceBadgeClasses: Record<SourceId, string> = {
  ozbargain:
    "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  pointhacks:
    "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  freepoints:
    "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-400",
  gcdb: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  manual:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/** Program → badge tint (FreePoints-style program pills). */
function programClass(program?: string | null): string {
  const p = (program ?? "").toLowerCase();
  if (p.includes("qantas"))
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400";
  if (p.includes("velocity"))
    return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400";
  if (p.includes("flybuys"))
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400";
  if (p.includes("everyday"))
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return "border-border bg-muted text-muted-foreground";
}

/**
 * Softer, smaller confidence indicator than the shared ConfidenceBadge — used
 * across the Deals page to reduce visual noise (req: soften "needs verification").
 */
export function ConfidencePill({
  confidence,
  className,
}: {
  confidence: Confidence;
  className?: string;
}) {
  if (confidence === "confirmed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400",
          className
        )}
      >
        <Check className="size-3" />
        Confirmed
      </span>
    );
  }
  if (confidence === "expired-unknown") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground",
          className
        )}
      >
        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
        Expired
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] text-muted-foreground",
        className
      )}
      title="Unverified — confirm at the source"
    >
      <span className="size-1.5 rounded-full bg-amber-500/70" />
      Unverified
    </span>
  );
}

export function CitationLinks({
  citations,
  className,
}: {
  citations: Citation[];
  className?: string;
}) {
  if (citations.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {citations.map((c) => {
        const meta = SOURCE_META[c.source];
        const external = c.sourceUrl.startsWith("http");
        const classes = cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
          sourceBadgeClasses[c.source]
        );
        if (!external) {
          return (
            <span key={c.source + c.sourceUrl} className={classes}>
              {meta.displayName}
            </span>
          );
        }
        return (
          <a
            key={c.source + c.sourceUrl}
            href={c.sourceUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className={cn(classes, "transition-opacity hover:opacity-80")}
          >
            {meta.displayName}
            <ExternalLink className="size-2.5" />
          </a>
        );
      })}
    </div>
  );
}

/** Expiry line, tinted amber when expiring soon. */
export function ExpiryLine({
  expiryDate,
  expiringSoon,
  expired,
}: {
  expiryDate: string | null;
  expiringSoon?: boolean;
  expired: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px]",
        expiringSoon
          ? "font-medium text-amber-700 dark:text-amber-400"
          : "text-muted-foreground"
      )}
    >
      <Clock className="size-3" />
      {expiryDate
        ? `${expired ? "Expired" : expiringSoon ? "Ends soon —" : "Expires"} ${formatDateAU(expiryDate)}`
        : "Check source for expiry"}
    </span>
  );
}

/** "Last checked" line — when this offer's data was last manually verified. */
export function CheckedLine({ lastCheckedAt }: { lastCheckedAt?: string | null }) {
  const checked = formatDateAU(lastCheckedAt ?? null);
  if (!checked) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <RefreshCw className="size-3" />
      Checked {checked}
    </span>
  );
}

export function WeeklyDealCard({ data }: { data: WeeklyDealCardData }) {
  const tone = toneStyles[data.tone ?? "emerald"];
  const Icon = data.icon ?? kindIcons[data.kind];
  const expired = data.confidence === "expired-unknown";
  const variant = data.variant ?? "default";

  // ── GCDB-style gift card card ──────────────────────────────────────────
  if (variant === "giftcard") {
    return (
      <Card
        className={cn(
          "gap-0 overflow-hidden py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md",
          expired && "opacity-70"
        )}
      >
        <CardContent className="flex h-full flex-col p-0">
          {/* Visual badge banner (CSS only) */}
          <div
            className={cn(
              "flex items-center justify-between gap-3 border-b bg-gradient-to-br px-4 py-3",
              tone.grad
            )}
          >
            <div className="min-w-0">
              <p className={cn("text-2xl font-extrabold leading-none tracking-tight", tone.text)}>
                {data.badge?.value ?? "Offer"}
              </p>
              {data.badge?.caption && (
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {data.badge.caption}
                </p>
              )}
            </div>
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone.tile)}>
              <Icon className="size-5" />
            </span>
          </div>

          <div className="flex h-full flex-col gap-2 p-4">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {data.category}
              </Badge>
              <ConfidencePill confidence={data.confidence} className="ml-auto" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{data.title}</p>
              {data.subject && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  via {data.subject}
                </p>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {data.summary}
            </p>

            {/* GCDB-style practical facts */}
            {data.details && data.details.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 p-2.5">
                {data.details.map((f) => (
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
            )}

            {/* Collapsible usage & stack notes (keeps the card short) */}
            {(data.usageNotes?.length ||
              data.stackNotes?.length ||
              data.detailUrl) && (
              <details className="group rounded-lg border px-2.5 py-1.5">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                  Usage &amp; stack notes
                </summary>
                <div className="mt-2 space-y-2 text-[11px] leading-snug">
                  {data.usageNotes && data.usageNotes.length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        How to use
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {data.usageNotes.map((n) => (
                          <li key={n} className="flex gap-1.5">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-violet-500/60" />
                            <span className="text-muted-foreground">{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.stackNotes && data.stackNotes.length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Stacking
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {data.stackNotes.map((n) => (
                          <li key={n} className="flex gap-1.5">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-500/60" />
                            <span className="text-muted-foreground">{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.detailUrl && (
                    <a
                      href={data.detailUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:opacity-80 dark:text-emerald-400"
                    >
                      Offer details
                      <ExternalLink className="size-2.5" />
                    </a>
                  )}
                </div>
              </details>
            )}

            <div className="mt-auto flex flex-col gap-2 border-t pt-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ExpiryLine
                  expiryDate={data.expiryDate}
                  expiringSoon={data.expiringSoon}
                  expired={expired}
                />
                <CheckedLine lastCheckedAt={data.lastCheckedAt} />
              </div>
              <CitationLinks citations={data.citations} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── FreePoints-style points card ───────────────────────────────────────
  if (variant === "points") {
    return (
      <Card
        className={cn(
          "gap-0 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/40 hover:shadow-md",
          expired && "opacity-70"
        )}
      >
        <CardContent className="flex h-full flex-col gap-2.5 p-4">
          <div className="flex items-center gap-2">
            {data.program && (
              <Badge
                variant="outline"
                className={cn("gap-1 text-[10px]", programClass(data.program))}
              >
                <Star className="size-3" />
                {data.program}
              </Badge>
            )}
            <ConfidencePill confidence={data.confidence} className="ml-auto" />
          </div>

          {/* Points figure is the focus */}
          <div className="flex items-baseline gap-2">
            <span className={cn("text-3xl font-extrabold tracking-tight", tone.text)}>
              {data.badge?.value ?? data.highlight}
            </span>
            {data.badge?.caption && (
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {data.badge.caption}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{data.title}</p>
            {data.subject && (
              <p className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
                <StoreIcon className="size-3 shrink-0" />
                {data.subject}
              </p>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {data.summary}
          </p>

          <div className="mt-auto flex flex-col gap-2 border-t pt-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ExpiryLine
                expiryDate={data.expiryDate}
                expiringSoon={data.expiringSoon}
                expired={expired}
              />
              <CheckedLine lastCheckedAt={data.lastCheckedAt} />
            </div>
            <CitationLinks citations={data.citations} />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── OzBargain-style community signal feed row ──────────────────────────
  if (variant === "signal") {
    return (
      <Card
        className={cn(
          "gap-0 overflow-hidden border-l-4 border-l-orange-500/60 py-0 shadow-sm transition-all duration-200 hover:border-l-orange-500",
          expired && "opacity-70"
        )}
      >
        <CardContent className="flex h-full flex-col gap-2 p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="gap-1 border-orange-500/25 bg-orange-500/10 text-[10px] text-orange-700 dark:text-orange-400"
            >
              <Flame className="size-3" />
              Community signal
            </Badge>
            {data.isSample && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
              >
                <FlaskConical className="size-3" />
                Sample
              </Badge>
            )}
            {data.subject && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <StoreIcon className="size-3" />
                {data.subject}
              </span>
            )}
            <ConfidencePill confidence={data.confidence} className="ml-auto" />
          </div>

          <p className="text-sm font-semibold leading-snug">{data.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {data.summary}
          </p>

          {(data.promoCode || data.priceText) && (
            <div className="flex flex-wrap items-center gap-2">
              {data.promoCode && (
                <code className="rounded border border-dashed border-emerald-500/40 bg-emerald-500/5 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {data.promoCode}
                </code>
              )}
              {data.priceText && (
                <span className="text-[11px] font-semibold">{data.priceText}</span>
              )}
            </div>
          )}

          {data.tags && data.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto flex flex-col gap-1.5 border-t pt-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {typeof data.votes === "number" && (
                <span className="inline-flex items-center gap-1 font-medium text-orange-700 dark:text-orange-400">
                  <Flame className="size-3" />
                  {data.votes} votes
                </span>
              )}
              {typeof data.comments === "number" && (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="size-3" />
                  {data.comments}
                </span>
              )}
              {data.postedAt && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatDateAU(data.postedAt)}
                </span>
              )}
              {data.expiryDate && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    data.expiringSoon &&
                      "font-medium text-amber-700 dark:text-amber-400"
                  )}
                >
                  <CalendarClock className="size-3" />
                  {expired
                    ? "Expired"
                    : data.expiringSoon
                      ? "Ends soon"
                      : "Expires"}{" "}
                  {formatDateAU(data.expiryDate)}
                </span>
              )}
              <CheckedLine lastCheckedAt={data.lastCheckedAt} />
            </div>
            {data.isSample ? (
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  className="h-7 w-fit gap-1 px-2 text-[11px]"
                >
                  <FlaskConical className="size-3" />
                  Sample OzBargain signal
                </Button>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Sample entry with no live link — real signals link to the
                  original OzBargain post.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-[11px]"
                >
                  <a
                    href={data.sourceUrl ?? data.citations[0]?.sourceUrl ?? "#"}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                  >
                    View OzBargain signal
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
                {data.retailerUrl && (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[11px]"
                  >
                    <a
                      href={data.retailerUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                    >
                      View retailer
                      <ExternalLink className="size-3" />
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Default compact card (curated picks) ───────────────────────────────
  return (
    <Card
      className={cn(
        "gap-0 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md",
        expired && "opacity-70"
      )}
    >
      <CardContent className="flex h-full flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {data.category}
          </Badge>
          <ConfidencePill confidence={data.confidence} className="ml-auto" />
        </div>

        <div className="flex items-start gap-2.5">
          <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", tone.tile)}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{data.title}</p>
            {data.subject && (
              <p className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
                <StoreIcon className="size-3 shrink-0" />
                {data.subject}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {data.summary}
        </p>

        {data.highlight && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 px-2.5 py-1.5">
            <span className={cn("text-sm font-bold", tone.text)}>
              {data.highlight}
            </span>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 border-t pt-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ExpiryLine
              expiryDate={data.expiryDate}
              expiringSoon={data.expiringSoon}
              expired={expired}
            />
            <CheckedLine lastCheckedAt={data.lastCheckedAt} />
          </div>
          <CitationLinks citations={data.citations} />
        </div>
      </CardContent>
    </Card>
  );
}

export default WeeklyDealCard;
