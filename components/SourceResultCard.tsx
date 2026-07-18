import {
  BadgePercent,
  Clock,
  CreditCard,
  ExternalLink,
  Gift,
  RefreshCw,
  Star,
  Store as StoreIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  SOURCE_META,
  type DealSourceResult,
  type Citation,
  type SourceId,
} from "@/lib/sources/types";
import { cn } from "@/lib/utils";

/** Subtle per-source tints so citations are recognisable at a glance */
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

const kindIcons = {
  "discount-code": BadgePercent,
  cashback: CreditCard,
  "gift-card": Gift,
  points: Star,
  guide: StoreIcon,
} as const;

function SourceBadge({ source }: { source: SourceId }) {
  return (
    <Badge
      variant="outline"
      className={cn("px-1.5 py-0 text-[10px]", sourceBadgeClasses[source])}
    >
      {SOURCE_META[source].displayName}
    </Badge>
  );
}

export function SourceResultCard({
  result,
}: {
  result: DealSourceResult & { citations?: Citation[] };
}) {
  const KindIcon = kindIcons[result.kind];
  const citations = result.citations ?? [
    { source: result.source, sourceUrl: result.sourceUrl },
  ];
  const headline =
    result.discountPercent !== null
      ? `${result.discountPercent}% off`
      : result.pointsAmount;
  const expired = result.confidence === "expired-unknown";

  return (
    <Card className={cn("gap-0 py-0", expired && "opacity-70")}>
      <CardContent className="flex h-full flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {citations.map((c) => (
            <SourceBadge key={c.source + c.sourceUrl} source={c.source} />
          ))}
          <ConfidenceBadge confidence={result.confidence} className="ml-auto" />
        </div>

        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <KindIcon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{result.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {result.summary}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {headline && (
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {headline}
            </span>
          )}
          {result.merchant && (
            <span className="inline-flex items-center gap-1">
              <StoreIcon className="size-3" />
              {result.merchant}
            </span>
          )}
          {result.pointsProgram && (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 text-amber-500" />
              {result.pointsProgram}
            </span>
          )}
          {result.giftCardBrand && (
            <span className="inline-flex items-center gap-1">
              <Gift className="size-3 text-violet-500" />
              {result.giftCardBrand}
            </span>
          )}
          {result.cardOrProvider && (
            <span className="inline-flex items-center gap-1">
              <CreditCard className="size-3" />
              {result.cardOrProvider}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
          <div className="flex min-w-0 flex-col gap-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {result.expiryDate
                ? `${expired ? "Expired" : "Expires"} ${formatDateAU(result.expiryDate)}`
                : "Check provider for expiry"}
            </span>
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="size-3" />
              Checked {formatDateAU(result.lastCheckedAt)}
            </span>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a
              href={result.sourceUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
            >
              View source
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SourceResultCard;
