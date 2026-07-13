export const ALERT_CRITERIA_KINDS = [
  "store",
  "gift-card-brand",
  "programme",
  "expiring-soon",
] as const;

export type AlertCriteriaKind = (typeof ALERT_CRITERIA_KINDS)[number];

export interface AlertCriteria {
  kind: AlertCriteriaKind;
  key: string | null;
}

export interface AlertCandidate {
  dedupeKey: string;
  title: string;
  detailPath: string;
  storeKey: string | null;
  giftCardBrandKey: string | null;
  programmeKey: string | null;
  expiryDate: string | null;
  valueLabel: string;
}

export interface AlertSubscriptionMatch {
  subscriptionId: string;
  recipientEmail: string;
  criteria: AlertCriteria;
  candidate: AlertCandidate;
}
