export interface OfferOccurrence {
  id: string;
  sellerKey: string;
  productKey: string;
  mechanic: string;
  value: number;
  startDate: string | null;
  endDate: string;
  verifiedAt: string;
}

export interface OfferHistorySummary {
  comparable: OfferOccurrence[];
  canPredict: boolean;
  medianValue: number | null;
  typicalFrequencyDays: number | null;
}

export function comparableOccurrence(
  left: OfferOccurrence,
  right: OfferOccurrence
): boolean {
  return (
    left.sellerKey === right.sellerKey &&
    left.productKey === right.productKey &&
    left.mechanic === right.mechanic
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summariseOfferHistory(
  reference: OfferOccurrence,
  occurrences: OfferOccurrence[]
): OfferHistorySummary {
  const comparable = occurrences
    .filter((occurrence) => comparableOccurrence(reference, occurrence))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  const canPredict = comparable.length >= 3;
  if (!canPredict) {
    return { comparable, canPredict, medianValue: null, typicalFrequencyDays: null };
  }
  const gaps = comparable.slice(1).map((occurrence, index) => {
    const before = Date.parse(`${comparable[index].endDate}T00:00:00Z`);
    const after = Date.parse(`${occurrence.endDate}T00:00:00Z`);
    return Math.round((after - before) / 86_400_000);
  });
  return {
    comparable,
    canPredict,
    medianValue: median(comparable.map((occurrence) => occurrence.value)),
    typicalFrequencyDays: median(gaps),
  };
}
