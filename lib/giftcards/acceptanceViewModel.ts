import type { GiftCardAcceptanceRow } from "@/lib/offers/types";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  CANONICAL_ACCEPTANCE_STATUS_LABEL,
  acceptanceEvidenceLabel,
  acceptanceMccDisclaimer,
  canonicalAcceptanceStatus,
  deriveAcceptanceFreshness,
  isCurrentlyAccepted,
} from "./acceptanceModel";

export interface AcceptancePublicView {
  statusLabel: string;
  evidenceLabel: string;
  evidenceUrl: string | null;
  checkedLabel: string;
  freshnessLabel: string;
  channelLabels: string[];
  channelsLabel: string;
  limitationsLabel: string | null;
  mccDisclaimer: string | null;
  current: boolean;
  historical: boolean;
}

/** One public wording source shared by detail, search and where-to-use. */
export function acceptancePublicView(
  row: GiftCardAcceptanceRow,
  now: Date,
): AcceptancePublicView {
  const status = canonicalAcceptanceStatus(row);
  const freshness = deriveAcceptanceFreshness(row, now);
  const channelLabels = [
    row.acceptsOnline === true ? "Online" : null,
    row.acceptsInStore === true ? "In store" : null,
    row.acceptsApp === true ? "App" : null,
    row.acceptsPhone === true ? "Phone" : null,
  ].filter((value): value is string => value != null);
  return {
    statusLabel: CANONICAL_ACCEPTANCE_STATUS_LABEL[status],
    evidenceLabel: acceptanceEvidenceLabel(row),
    evidenceUrl: row.evidenceUrl ?? row.sourceUrl
      ? safePublicSourceUrl((row.evidenceUrl ?? row.sourceUrl)!)
      : null,
    checkedLabel: (row.lastCheckedAt ?? row.checkedAt)
      ? `Checked ${formatDateAU((row.lastCheckedAt ?? row.checkedAt)!.slice(0, 10))}`
      : "Check date not recorded",
    freshnessLabel:
      freshness === "current"
        ? "Current evidence"
        : freshness === "stale"
          ? "Stale — recheck required"
          : "Check date not recorded",
    channelLabels,
    channelsLabel: channelLabels.length
      ? `Redemption channels: ${channelLabels.join(", ")}`
      : "Redemption channel not recorded.",
    limitationsLabel: row.limitations
      ? `Limitations: ${row.limitations}`
      : null,
    mccDisclaimer: row.mcc != null ? acceptanceMccDisclaimer(row) : null,
    current: isCurrentlyAccepted(row, now),
    historical:
      status === "confirmed-not-accepted" ||
      (row.validUntil != null && row.validUntil < now.toISOString().slice(0, 10)),
  };
}
