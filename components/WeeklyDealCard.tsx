import {
  BadgePercent,
  Clock,
  CreditCard,
  ExternalLink,
  Gift,
  type LucideIcon,
  RefreshCw,
  Star,
  Store as StoreIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import ConfidenceBadge from "@/components/ConfidenceBadge";
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
 * Compact, responsive card for a single weekly deal or offer (gift card,
 * points boost, cashback boost, OzBargain signal or a curated pick).
 *
 * It is presentation-only and takes a normalised `WeeklyDealCardData` so the
 * Deals page can feed it from any of the static offer types in
 * lib/offers/manualOffers.ts. No data fetching, no network.
 */

export type WeeklyDealTone =
  | "emerald"
  | "violet"
  | "amber"
  | "rose"
  | "orange"
  | "sky";

export interface WeeklyDealCardData {
  /** Drives the default icon when no explicit `icon` is given. */
  kind: DealKind;
  /** Short label shown as the top-left chip, e.g. "Gift card offer". */
  category: string;
  title: string;
  summary: string;
  /** Merchant name or gift card brand. */
  subject?: string | null;
  /** Headline value, e.g. "5% off", "20x points", "6% cashback". */
  highlight?: string | null;
  tone?: WeeklyDealTone;
  /** Optional icon override (e.g. a flame for community signals). */
  icon?: LucideIcon;
  expiryDate: string | null;
  lastCheckedAt?: string | null;
  confidence: Confidence;
  citations: Citation[];
}

const toneStyles: Record<WeeklyDealTone, { tile: string; text: string }> = {
  emerald: {
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  violet: {
    tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    text: "text-violet-700 dark:text-violet-400",
  },
  amber: {
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    text: "text-amber-700 dark:text-amber-400",
  },
  rose: {
    tile: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    text: "text-rose-700 dark:text-rose-400",
  },
  orange: {
    tile: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    text: "text-orange-700 dark:text-orange-400",
  },
  sky: {
    tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    text: "text-sky-700 dark:text-sky-400",
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

export function CitationLinks({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {citations.map((c) => {
        const meta = SOURCE_META[c.source];
        const external = c.sourceUrl.startsWith("http");
        const className = cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
          sourceBadgeClasses[c.source]
        );
        if (!external) {
          return (
            <span key={c.source + c.sourceUrl} className={className}>
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
            className={cn(className, "transition-opacity hover:opacity-80")}
          >
            {meta.displayName}
            <ExternalLink className="size-2.5" />
          </a>
        );
      })}
    </div>
  );
}

export function WeeklyDealCard({ data }: { data: WeeklyDealCardData }) {
  const tone = toneStyles[data.tone ?? "emerald"];
  const Icon = data.icon ?? kindIcons[data.kind];
  const expired = data.confidence === "expired-unknown";

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
          <ConfidenceBadge confidence={data.confidence} className="ml-auto" />
        </div>

        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
              tone.tile
            )}
          >
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
          <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {data.expiryDate
                ? `${expired ? "Expired" : "Expires"} ${formatDateAU(data.expiryDate)}`
                : "Check source for expiry"}
            </span>
            {data.lastCheckedAt && (
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="size-3" />
                Checked {formatDateAU(data.lastCheckedAt)}
              </span>
            )}
          </div>
          <CitationLinks citations={data.citations} />
        </div>
      </CardContent>
    </Card>
  );
}

export default WeeklyDealCard;
