export interface SignalSeedRow {
  id: string;
  source_native_id: string | null;
}

export interface ExistingSignalKey {
  id: string;
  source_native_id: string | null;
}

/** Static demo signals must never become approved production rows via seed. */
export function filterProductionSignals<T extends { isSample: boolean }>(
  signals: T[]
): T[] {
  return signals.filter((signal) => !signal.isSample);
}

export function filterSeedableSignals<T extends SignalSeedRow>(
  rows: T[],
  existing: ExistingSignalKey[]
): { seedable: T[]; skipped: { row: T; ownedById: string }[] } {
  const owners = new Map<string, string>();
  for (const row of existing) {
    if (row.source_native_id !== null) owners.set(row.source_native_id, row.id);
  }

  const seedable: T[] = [];
  const skipped: { row: T; ownedById: string }[] = [];
  for (const row of rows) {
    const owner = row.source_native_id
      ? owners.get(row.source_native_id)
      : undefined;
    if (owner && owner !== row.id) skipped.push({ row, ownedById: owner });
    else seedable.push(row);
  }
  return { seedable, skipped };
}
