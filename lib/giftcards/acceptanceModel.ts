import type {
  GiftCardAcceptanceRow,
  GiftCardAcceptanceEvidenceType,
  GiftCardAcceptanceStatus,
  GiftCardOffer,
  GiftCardProduct,
} from "@/lib/offers/types";
import { todayAU } from "@/lib/offers/expiry";
import { STALE_DATA_DAYS } from "@/lib/stack/compatibility";

/**
 * Per-product acceptance view model for the "Where each card works" section.
 * Composes ONLY approved structured rows (products, published acceptance
 * facts, the offer's own retailer lists) — no source prose. Acceptance is
 * never presented as guaranteed: the MCC_DISCLAIMER accompanies every list.
 */

export const MCC_DISCLAIMER =
  "Acceptance depends on the merchant category code assigned to the transaction. Verify before purchase.";

export const UNOFFICIAL_MCC_DISCLAIMER =
  "Unofficial MCC-based acceptance can vary by terminal and transaction coding. Verify before purchase.";

export const ACCEPTANCE_STALE_DAYS = STALE_DATA_DAYS;

export type AcceptanceFreshness = "current" | "stale" | "not-checked";

export const ACCEPTANCE_EVIDENCE_RANK: Record<
  GiftCardAcceptanceEvidenceType,
  number
> = {
  "issuer-official": 7,
  "merchant-official": 6,
  terms: 5,
  "card-network-mcc": 4,
  gcdb: 3,
  specialist: 2,
  community: 1,
};

export const ACCEPTANCE_STATUS_RANK: Record<GiftCardAcceptanceStatus, number> = {
  "confirmed-accepted": 6,
  "likely-accepted": 5,
  "unofficially-reported": 4,
  "requires-verification": 3,
  stale: 2,
  unknown: 1,
  "confirmed-not-accepted": 0,
};

/** Migration-028 canonical status with the documented 021 legacy fallback. */
export function canonicalAcceptanceStatus(
  row: GiftCardAcceptanceRow,
): GiftCardAcceptanceStatus {
  // A recorded failure is the safest legacy signal and must not be masked by
  // an inconsistent positive canonical field.
  if (row.outcome === "unsuccessful") return "confirmed-not-accepted";
  if (row.acceptanceStatus) return row.acceptanceStatus;
  if (row.status === "verified") return "confirmed-accepted";
  if (row.status === "claimed") return "likely-accepted";
  return "unofficially-reported";
}

export function deriveAcceptanceFreshness(
  row: GiftCardAcceptanceRow,
  now: Date,
): AcceptanceFreshness {
  const checkedAt = row.lastCheckedAt ?? row.checkedAt;
  if (!checkedAt) return "not-checked";
  const checked = Date.parse(checkedAt);
  if (Number.isNaN(checked)) return "not-checked";
  return now.getTime() - checked > ACCEPTANCE_STALE_DAYS * 86_400_000
    ? "stale"
    : "current";
}

/** The only public evidence attribution catalogue for acceptance facts. */
export function acceptanceEvidenceLabel(row: GiftCardAcceptanceRow): string {
  switch (row.evidenceSourceType) {
    case "issuer-official":
    case "merchant-official":
    case "terms":
      return `Officially listed by ${row.evidencePublisher ?? "the issuer"}`;
    case "gcdb":
      return "Listed by GCDB; issuer confirmation not found";
    case "card-network-mcc":
      return "Unofficial MCC-based acceptance";
    case "specialist":
    case "community":
      return "Acceptance requires verification";
    default:
      return "Acceptance requires verification";
  }
}

export function acceptanceMccDisclaimer(row: GiftCardAcceptanceRow): string {
  return row.mcc != null && row.evidenceSourceType === "card-network-mcc"
    ? UNOFFICIAL_MCC_DISCLAIMER
    : MCC_DISCLAIMER;
}

export function isPositiveAcceptance(row: GiftCardAcceptanceRow): boolean {
  return [
    "confirmed-accepted",
    "likely-accepted",
    "unofficially-reported",
    "stale",
  ].includes(canonicalAcceptanceStatus(row));
}

export function isCurrentlyAccepted(
  row: GiftCardAcceptanceRow,
  now: Date,
): boolean {
  if (!isPositiveAcceptance(row)) return false;
  if (canonicalAcceptanceStatus(row) === "stale") return false;
  if (deriveAcceptanceFreshness(row, now) !== "current") return false;
  const today = todayAU(now);
  if (row.validFrom && row.validFrom > today) return false;
  if (row.validUntil && row.validUntil < today) return false;
  return true;
}

export const ACCEPTANCE_STATUS_LABEL: Record<
  GiftCardAcceptanceRow["status"],
  string
> = {
  verified: "Verified",
  claimed: "Claimed by issuer",
  community: "Community-reported",
};

export const CANONICAL_ACCEPTANCE_STATUS_LABEL: Record<
  GiftCardAcceptanceStatus,
  string
> = {
  "confirmed-accepted": "Confirmed accepted",
  "confirmed-not-accepted": "Confirmed not accepted",
  "likely-accepted": "Likely accepted",
  "unofficially-reported": "Unofficially reported",
  "requires-verification": "Requires verification",
  stale: "Stale — recheck required",
  unknown: "Not recorded",
};

export interface ProductAcceptanceView {
  product: GiftCardProduct | null;
  /** Product id (present even when the product row itself is not activated). */
  productId: string;
  /** Display heading — product brand, or the offer brand as fallback. */
  title: string;
  /** Accepted merchants (verified/claimed/community, successful or untested). */
  merchants: GiftCardAcceptanceRow[];
  /** Merchants recorded as NOT working. */
  rejectedMerchants: GiftCardAcceptanceRow[];
  /** Closed relationships retained for the dedicated history surface only. */
  historicalMerchants: GiftCardAcceptanceRow[];
  /** Distinct accepted merchant categories, from the acceptance evidence. */
  categories: string[];
  supportedMccs: number[];
  unsupportedMccs: number[];
  /** ISO timestamp of the freshest acceptance check, if any. */
  lastCheckedAt: string | null;
}

/** Offer + activated products + published acceptance → per-product views. */
export function buildProductAcceptance(
  offer: GiftCardOffer,
  products: GiftCardProduct[],
  acceptance: GiftCardAcceptanceRow[],
  now: Date = new Date(),
): ProductAcceptanceView[] {
  const today = todayAU(now);
  const productIds = [
    ...new Set(
      [offer.productId, ...(offer.includedProductIds ?? [])].filter(
        (id): id is string => Boolean(id)
      )
    ),
  ];
  const productById = new Map(products.map((p) => [p.id, p]));

  return productIds.map((productId) => {
    const product = productById.get(productId) ?? null;
    const rows = acceptance.filter((row) => row.productId === productId);
    const historicalMerchants = rows.filter(
      (row) =>
        row.validUntil != null &&
        (row.validUntil < today ||
          canonicalAcceptanceStatus(row) === "confirmed-not-accepted"),
    );
    const historicalIds = new Set(historicalMerchants.map((row) => row.id));
    const merchants = rows.filter(
      (row) =>
        isPositiveAcceptance(row) &&
        !historicalIds.has(row.id) &&
        (!row.validFrom || row.validFrom <= today),
    );
    const rejectedMerchants = rows.filter(
      (row) =>
        canonicalAcceptanceStatus(row) === "confirmed-not-accepted" &&
        !historicalIds.has(row.id),
    );
    const categories = [
      ...new Set(
        rows
          .map((row) => row.merchantCategory?.trim())
          .filter((c): c is string => Boolean(c))
      ),
    ].sort();
    const lastCheckedAt =
      rows
        .map((row) => row.lastCheckedAt ?? row.checkedAt)
        .filter((c): c is string => Boolean(c))
        .sort()
        .at(-1) ?? null;
    return {
      product,
      productId,
      title: product?.brand ?? offer.brand,
      merchants,
      rejectedMerchants,
      historicalMerchants,
      categories,
      supportedMccs: product?.supportedMccs ?? [],
      unsupportedMccs: product?.unsupportedMccs ?? [],
      lastCheckedAt,
    };
  });
}
