import { AlertTriangle, ExternalLink, Layers, Store as StoreIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreLogo } from "@/components/StoreLogo";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import {
  comparablePrice,
  type SmartStackComparison,
  type SmartStackResult,
} from "@/lib/stack/smartStack";

function retailerName(result: SmartStackResult, stores: Store[]): string {
  if (result.recommendation) return result.recommendation.merchantName;
  return (
    stores.find((store) => store.id === result.signal.merchantId)?.name ??
    "Retailer"
  );
}

function retailerLink(
  result: SmartStackResult,
  retailer: string
): { href: string; label: string } | null {
  if (result.signal.isSample) return null;
  const productUrl = result.signal.productUrl
    ? safeHttpsUrl(result.signal.productUrl)
    : null;
  const merchantUrl = result.signal.merchantUrl
    ? safeHttpsUrl(result.signal.merchantUrl)
    : null;
  if (productUrl) return { href: productUrl, label: `View at ${retailer}` };
  if (merchantUrl) return { href: merchantUrl, label: `Visit ${retailer}` };
  const sourceUrl = safeHttpsUrl(result.signal.sourceUrl);
  return sourceUrl ? { href: sourceUrl, label: "View deal source" } : null;
}

export function SmartStackComparisonCard({
  comparison,
  stores,
}: {
  comparison: SmartStackComparison;
  stores: Store[];
}) {
  return (
    <Card className="gap-0 py-0 shadow-sm lg:col-span-2">
      <CardHeader className="gap-2 border-b p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="gap-1" variant="secondary">
            <StoreIcon className="size-3" />
            Compare {comparison.options.length} retailers
          </Badge>
          <Badge className="gap-1" variant="outline">
            <Layers className="size-3" />
            Smart Stack prices
          </Badge>
        </div>
        <CardTitle className="text-base leading-snug">
          {comparison.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {comparison.options.map((result, index) => {
            const { signal, recommendation, signalPrice } = result;
            const effectivePrice = comparablePrice(result);
            const merchantId = recommendation?.merchantId ?? signal.merchantId;
            const store = stores.find((item) => item.id === merchantId);
            const name = retailerName(result, stores);
            const link = retailerLink(result, name);
            const included = recommendation?.components.filter(
              (component) => !component.optional
            );
            const alternatives = recommendation?.components.filter(
              (component) => component.optional
            );

            return (
              <div
                key={signal.id}
                className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <StoreLogo
                      store={store}
                      text={name.slice(0, 2).toUpperCase()}
                      size="xs"
                    />
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {name}
                    </p>
                    {index === 0 && effectivePrice !== null ? (
                      <Badge className="shrink-0 text-[10px]">Best price</Badge>
                    ) : null}
                  </div>

                  {recommendation ? (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {included && included.length > 0 ? (
                        <p>
                          Stack: {included.map((component) => component.label).join(" + ")}
                        </p>
                      ) : null}
                      {alternatives && alternatives.length > 0 ? (
                        <p>
                          Alternative: {alternatives.map((component) => component.label).join("; ")}
                        </p>
                      ) : null}
                      {recommendation.warnings.map((warning) => (
                        <p
                          key={`${warning.code}-${warning.message}`}
                          className="flex items-start gap-1 text-amber-700 dark:text-amber-400"
                        >
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          {warning.message}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No verified stackable saving layer available.
                    </p>
                  )}
                </div>

                <div className="flex items-end justify-between gap-4 sm:min-w-44 sm:flex-col sm:items-end">
                  <div className="sm:text-right">
                    <p className="text-[11px] text-muted-foreground">
                      {recommendation && signalPrice !== null
                        ? `Listed ${formatAUD(signalPrice)}`
                        : "Listed price"}
                    </p>
                    <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                      {effectivePrice !== null
                        ? formatAUD(effectivePrice)
                        : signal.priceText ?? "Check retailer"}
                    </p>
                    {recommendation && signalPrice !== null ? (
                      <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        Save {formatAUD(recommendation.totalSaving)} with stack
                      </p>
                    ) : null}
                  </div>
                  {link ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={link.href} target="_blank" rel="noopener noreferrer nofollow">
                        {link.label} <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {signal.isSample ? "Sample listing" : "Link unavailable"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default SmartStackComparisonCard;
