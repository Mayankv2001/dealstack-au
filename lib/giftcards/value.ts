/**
 * Shared gift-card valuation arithmetic — the ONE place these formulas live.
 * Used by the offer card, detail page, admin preview and the stack engine so
 * every surface shows identical numbers. Pure, no I/O.
 *
 * Formulas (documented for the public "how we value points" disclosure):
 *
 * BONUS VALUE — "10% bonus value" on a $100 card yields $110 of spending
 * power for $100 cash:
 *   effectiveDiscount% = bonus / (100 + bonus) × 100        (10 → 9.09%)
 *
 * POINTS — "20x Everyday Rewards points" on a $100 card at the programme's
 * standard earn (1 point per $1) earns 20 × 100 = 2,000 points. At the
 * DISCLOSED valuation (default 0.5c per Everyday Rewards point — 2,000 points
 * = $10 of grocery credit):
 *   rewardValue$        = points × pointValueCents / 100
 *   effectiveDiscount%  = rewardValue / (faceValue + rewardValue) × 100
 * i.e. $10 of reward on $100 cash ≈ 9.09% against the net economic cost.
 * Points are NEVER presented as guaranteed cash — cash paid and reward value
 * stay separate everywhere.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Default cents-per-point valuations for the disclosed cash-equivalent
 * estimate, overridable per offer (`points_value_cents`). Sources: standard
 * in-programme redemption rates (2,000 pts = $10 for Everyday Rewards and
 * Flybuys).
 */
export const DEFAULT_POINT_VALUE_CENTS: Record<string, number> = {
  "everyday rewards": 0.5,
  flybuys: 0.5,
  qantas: 1,
  velocity: 1,
};

export function defaultPointValueCents(program: string | null): number | null {
  if (!program) return null;
  const key = program.trim().toLowerCase();
  for (const [name, cents] of Object.entries(DEFAULT_POINT_VALUE_CENTS)) {
    if (key.includes(name)) return cents;
  }
  return null;
}

/** "10% bonus value" → 9.09% effective discount. */
export function bonusEffectiveDiscountPercent(bonusPercent: number): number {
  if (!Number.isFinite(bonusPercent) || bonusPercent <= 0) return 0;
  return round2((bonusPercent / (100 + bonusPercent)) * 100);
}

export interface PointsValuation {
  /** Points earned on the given face value. */
  points: number;
  /** Disclosed cash-equivalent value of those points, in dollars. */
  valueDollars: number;
  /** Cents-per-point used (offer override or programme default). */
  pointValueCents: number;
  /** value / (face + value) — discount against the net economic cost. */
  effectiveDiscountPercent: number;
  /** face − value — the effective economic cost of the card. */
  effectiveCostDollars: number;
}

/**
 * Value a "Nx points" gift-card promotion at a face value. Returns null when
 * the multiplier is unusable or no point valuation is available (never guess).
 */
export function valuePointsOffer(
  multiplier: number | null,
  faceValue: number,
  program: string | null,
  pointValueCentsOverride?: number | null
): PointsValuation | null {
  if (!multiplier || !Number.isFinite(multiplier) || multiplier <= 0) return null;
  if (!Number.isFinite(faceValue) || faceValue <= 0) return null;
  const cents = pointValueCentsOverride ?? defaultPointValueCents(program);
  if (cents == null || cents <= 0) return null;
  const points = Math.round(faceValue * multiplier);
  const valueDollars = round2((points * cents) / 100);
  return {
    points,
    valueDollars,
    pointValueCents: cents,
    effectiveDiscountPercent: round2(
      (valueDollars / (faceValue + valueDollars)) * 100
    ),
    effectiveCostDollars: round2(faceValue - valueDollars),
  };
}

/** Value a fixed points award without pretending it scales with spend. */
export function valueFixedPointsOffer(
  fixedPoints: number | null,
  faceValue: number,
  program: string | null,
  pointValueCentsOverride?: number | null,
): PointsValuation | null {
  if (!fixedPoints || !Number.isFinite(fixedPoints) || fixedPoints <= 0)
    return null;
  if (!Number.isFinite(faceValue) || faceValue <= 0) return null;
  const cents = pointValueCentsOverride ?? defaultPointValueCents(program);
  if (cents == null || cents <= 0) return null;
  const points = Math.round(fixedPoints);
  const valueDollars = round2((points * cents) / 100);
  return {
    points,
    valueDollars,
    pointValueCents: cents,
    effectiveDiscountPercent: round2(
      (valueDollars / (faceValue + valueDollars)) * 100,
    ),
    effectiveCostDollars: round2(faceValue - valueDollars),
  };
}

export interface OfferValueInputs {
  promotionType: string;
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  fixedPoints?: number | null;
  pointsProgram: string | null;
  pointsValueCents?: number | null;
  fixedDiscountDollars?: number | null;
  promoCreditDollars?: number | null;
  feeWaiverDollars?: number | null;
  thresholdDollars?: number | null;
}

/**
 * The single "effective saving" figure for an offer, as a percentage of face
 * value economics. Direct discounts win as-is; bonus value and points use the
 * net-economic-cost formulas above. Null when nothing can be valued honestly.
 */
export function effectiveDiscountPercent(
  offer: OfferValueInputs,
  faceValue = 100
): number | null {
  if (offer.discountPercent && offer.discountPercent > 0) {
    return round2(offer.discountPercent);
  }
  if (offer.bonusPercent && offer.bonusPercent > 0) {
    return bonusEffectiveDiscountPercent(offer.bonusPercent);
  }
  if (
    offer.fixedDiscountDollars &&
    offer.fixedDiscountDollars > 0 &&
    offer.thresholdDollars &&
    offer.thresholdDollars > 0
  ) {
    return round2(
      Math.min(100, (offer.fixedDiscountDollars / offer.thresholdDollars) * 100)
    );
  }
  if (
    offer.promoCreditDollars &&
    offer.promoCreditDollars > 0 &&
    offer.thresholdDollars &&
    offer.thresholdDollars > 0
  ) {
    return round2(
      (offer.promoCreditDollars /
        (offer.thresholdDollars + offer.promoCreditDollars)) *
        100
    );
  }
  if (
    offer.feeWaiverDollars &&
    offer.feeWaiverDollars > 0 &&
    offer.thresholdDollars &&
    offer.thresholdDollars > 0
  ) {
    return round2(
      (offer.feeWaiverDollars /
        (offer.thresholdDollars + offer.feeWaiverDollars)) *
        100
    );
  }
  const points =
    valuePointsOffer(
      offer.pointsMultiplier,
      faceValue,
      offer.pointsProgram,
      offer.pointsValueCents,
    ) ??
    valueFixedPointsOffer(
      offer.fixedPoints ?? null,
      faceValue,
      offer.pointsProgram,
      offer.pointsValueCents,
    );
  return points ? points.effectiveDiscountPercent : null;
}

export interface GiftCardAcquisition {
  faceValue: number;
  cashPaid: number;
  saving: number;
}

// ── Worked example (detail page) ─────────────────────────────────────────────

export interface WorkedExampleInputs extends OfferValueInputs {
  /** Per-order face-value cap the saving applies to, if any. */
  capDollars?: number | null;
}

/**
 * One fully-worked purchase at a chosen face value. Cash effects and reward
 * estimates are kept strictly separate: `acquisitionSaving` is immediate cash
 * only; points/bonus value appear in their own fields and never inflate it.
 */
export interface WorkedExample {
  /** The face value the user asked about. */
  requestedFaceValue: number;
  /** Face value the saving actually covers (≤ requested when capped). */
  coveredFaceValue: number;
  /** Requested minus covered — bought at full price if still wanted. */
  uncoveredFaceValue: number;
  /** Cash handed over for the covered face value. */
  cashPaid: number;
  /** Immediate CASH saving from a % discount (0 for bonus/points offers). */
  acquisitionSaving: number;
  /** Extra spending power from a bonus-value promotion, in dollars. */
  bonusValueDollars: number | null;
  /** Points earned on the covered purchase, if a multiplier applies. */
  points: number | null;
  /** Disclosed estimate of those points, in dollars — never cash. */
  rewardValueDollars: number | null;
  pointValueCents: number | null;
  /** Face value you can spend (covered face + bonus value). */
  totalSpendingPower: number;
  /** cashPaid − rewardValue estimate: the effective economic cost. */
  effectiveCost: number;
}

/** Null when the offer has no quantifiable value at this face value. */
export function buildWorkedExample(
  offer: WorkedExampleInputs,
  requestedFaceValue: number
): WorkedExample | null {
  if (!Number.isFinite(requestedFaceValue) || requestedFaceValue <= 0) return null;

  const cap = offer.capDollars ?? null;
  const covered =
    cap != null && cap > 0 ? Math.min(requestedFaceValue, cap) : requestedFaceValue;
  const uncovered = round2(requestedFaceValue - covered);

  const discount =
    offer.discountPercent && offer.discountPercent > 0 ? offer.discountPercent : 0;
  const bonus = offer.bonusPercent && offer.bonusPercent > 0 ? offer.bonusPercent : 0;
  const pointsValuation =
    valuePointsOffer(
      offer.pointsMultiplier,
      covered,
      offer.pointsProgram,
      offer.pointsValueCents,
    ) ??
    valueFixedPointsOffer(
      offer.fixedPoints ?? null,
      covered,
      offer.pointsProgram,
      offer.pointsValueCents,
    );
  if (discount <= 0 && bonus <= 0 && !pointsValuation) return null;

  const cashPaid = round2(covered * (1 - discount / 100));
  const acquisitionSaving = round2(covered - cashPaid);
  const bonusValueDollars = bonus > 0 ? round2(covered * (bonus / 100)) : null;
  const rewardValueDollars = pointsValuation?.valueDollars ?? null;

  return {
    requestedFaceValue: round2(requestedFaceValue),
    coveredFaceValue: round2(covered),
    uncoveredFaceValue: uncovered,
    cashPaid,
    acquisitionSaving,
    bonusValueDollars,
    points: pointsValuation?.points ?? null,
    rewardValueDollars,
    pointValueCents: pointsValuation?.pointValueCents ?? null,
    totalSpendingPower: round2(covered + (bonusValueDollars ?? 0)),
    effectiveCost: round2(cashPaid - (rewardValueDollars ?? 0)),
  };
}

/**
 * Cost of acquiring gift cards to cover `spend`, at a % discount off face
 * value, honouring an optional per-order face-value cap and denomination
 * limits. Face value bought never exceeds what the caps allow; any uncovered
 * remainder is paid at full price by the caller.
 */
export function acquisitionForSpend(
  spend: number,
  discountPercent: number,
  capFaceValue: number | null = null,
  maxDenomination: number | null = null,
  purchaseLimitCount: number | null = null
): GiftCardAcquisition {
  if (!Number.isFinite(spend) || spend <= 0 || discountPercent <= 0) {
    return { faceValue: 0, cashPaid: 0, saving: 0 };
  }
  let face = spend;
  if (capFaceValue != null && capFaceValue > 0) face = Math.min(face, capFaceValue);
  if (maxDenomination != null && maxDenomination > 0) {
    const cards =
      purchaseLimitCount != null && purchaseLimitCount > 0
        ? Math.min(Math.ceil(face / maxDenomination), purchaseLimitCount)
        : Math.ceil(face / maxDenomination);
    face = Math.min(face, cards * maxDenomination);
  }
  face = round2(face);
  const cashPaid = round2(face * (1 - discountPercent / 100));
  return { faceValue: face, cashPaid, saving: round2(face - cashPaid) };
}
