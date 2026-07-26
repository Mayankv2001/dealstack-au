import type { PointsTransferBonus } from "@/lib/offers/types";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";

/**
 * Presenting a live transfer bonus.
 *
 * PURE — no clock of its own. Whether a bonus is still live is already settled
 * before it reaches here: RLS bounds the read to its Sydney expiry day and
 * run_daily_cleanup unpublishes it after (migration 040). So this formats what
 * it is given and never re-decides currency.
 */

/** Bonuses that land IN the given airline programme, best first. */
export function bonusesInto(
  toSlug: string,
  bonuses: PointsTransferBonus[]
): PointsTransferBonus[] {
  return bonuses
    .filter((bonus) => bonus.toProgramme === toSlug)
    .sort((a, b) => b.bonusPercentMax - a.bonusPercentMax);
}

/** "5–15%" for a range, "15%" when flat. */
export function bonusPercentLabel(bonus: PointsTransferBonus): string {
  const { bonusPercentMin: min, bonusPercentMax: max } = bonus;
  const fmt = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}`;
  return min === max ? `${fmt(max)}%` : `${fmt(min)}–${fmt(max)}%`;
}

/**
 * "Bonus 5–15% transferring from Flybuys". Falls back to the raw slug if the
 * programme is not in the editorial list, so an unknown slug degrades to
 * something still truthful rather than throwing.
 */
export function bonusHeadline(bonus: PointsTransferBonus): string {
  const from = REWARDS_PROGRAMMES.find((p) => p.slug === bonus.fromProgramme);
  return `Bonus ${bonusPercentLabel(bonus)} transferring from ${
    from?.shortName ?? bonus.fromProgramme
  }`;
}
