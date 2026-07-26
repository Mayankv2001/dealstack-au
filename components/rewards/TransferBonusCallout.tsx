import { TrendingUp } from "lucide-react";
import type { PointsTransferBonus } from "@/lib/offers/types";
import { bonusHeadline } from "@/lib/rewards/transferBonus";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * A live transfer bonus, as shown on both the /rewards hub cards and the
 * per-programme page. Shared rather than copied: a bonus is time-critical and
 * the two surfaces disagreeing on its wording or its end date is the failure
 * mode worth designing out.
 *
 * PRESENTATIONAL — currency is settled before this renders. RLS bounds the read
 * to the Sydney expiry day and run_daily_cleanup unpublishes afterwards
 * (migration 040), so anything passed here is live by definition.
 *
 * `compact` is the homepage cut: the headline and end date, without the
 * conditions note.
 */
export function TransferBonusCallout({
  bonuses,
  compact = false,
  className = "",
}: {
  bonuses: PointsTransferBonus[];
  compact?: boolean;
  className?: string;
}) {
  if (bonuses.length === 0) return null;

  return (
    <ul className={`space-y-2 ${className}`}>
      {bonuses.map((bonus) => {
        const ends = formatDateAU(bonus.expiryDate);
        return (
          <li
            key={bonus.id}
            className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2"
          >
            <TrendingUp
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                {bonusHeadline(bonus)}
              </p>
              {ends ? (
                <p className="text-xs font-semibold text-emerald-800/80 dark:text-emerald-300/80">
                  Ends {ends}
                </p>
              ) : null}
              {!compact && bonus.conditionsNote ? (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {bonus.conditionsNote}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default TransferBonusCallout;
