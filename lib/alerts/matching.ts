import type { AlertCandidate, AlertCriteria } from "./types";

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function alertCandidateMatches(criteria: AlertCriteria, candidate: AlertCandidate, today: string): boolean {
  switch (criteria.kind) {
    case "store":
      return Boolean(criteria.key && candidate.storeKey === criteria.key);
    case "gift-card-brand":
      return Boolean(criteria.key && candidate.giftCardBrandKey === criteria.key);
    case "programme":
      return Boolean(criteria.key && candidate.programmeKey === criteria.key);
    case "expiring-soon":
      return Boolean(candidate.expiryDate && candidate.expiryDate >= today && candidate.expiryDate <= addDaysIso(today, 2));
  }
}

export function matchingAlertCandidates(criteria: AlertCriteria, candidates: AlertCandidate[], today: string): AlertCandidate[] {
  return candidates.filter((candidate) => alertCandidateMatches(criteria, candidate, today));
}
