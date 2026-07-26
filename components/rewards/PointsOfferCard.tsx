import { Card, CardContent } from "@/components/ui/card";
import type { PointsOffer } from "@/lib/offers/types";
import { pointsOfferDateLabels } from "@/lib/rewards/pointsOfferDates";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";
import { formatDateAU } from "@/lib/sources/normalise";
import { SOURCE_META } from "@/lib/sources/types";

/**
 * A reviewed points offer. Extracted from /rewards/[slug] so the same card
 * renders a programme's own offers and the feeder-programme offers listed
 * beneath them — two copies would drift on exactly the parts that matter
 * (the checked date and the evidence link).
 *
 * PRESENTATIONAL. Estimated points are never netted off the cash price, and an
 * offer with no usable public source says so rather than staying silent.
 */
export function PointsOfferCard({
  offer,
  now,
}: {
  offer: PointsOffer;
  now?: Date;
}) {
  const dateLabels = pointsOfferDateLabels(offer, now ?? new Date());
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold">{offer.earnRateDisplay}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {offer.mechanism.replaceAll("-", " ")} · points are estimated, not cash
        </p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Checked {formatDateAU(offer.lastCheckedAt.slice(0, 10))}</span>
          {dateLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {offer.citations.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {offer.citations.flatMap((citation) => {
              const href = safePublicSourceUrl(citation.sourceUrl);
              return href
                ? [
                    <a
                      key={`${citation.source}-${href}`}
                      href={href}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Current{" "}
                      {SOURCE_META[citation.source]?.displayName ??
                        citation.source}{" "}
                      evidence
                    </a>,
                  ]
                : [];
            })}
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-700">
            Current public source link is not recorded; verify before relying on
            this offer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default PointsOfferCard;
