import type { GiftCardOffer } from "@/lib/offers/types";
import { sanitisePublicText } from "@/lib/stack/buildStack";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * The structured "Terms and limits" table for the offer detail page — every
 * row is a discrete labelled fact, never a wall of source text. Values come
 * ONLY from approved structured fields. `value: null` means the fact is
 * material but not recorded, and the page renders the honest fallback.
 */

export interface TermsRow {
  key: string;
  label: string;
  /** Display value; null = material fact not recorded (render fallback). */
  value: string | null;
  /** Render the value as an external link to this safe URL. */
  href?: string;
}

/** Standing disclaimer — gift cards are prepaid value, not refundable cash. */
export const EARLY_WITHDRAWAL_DISCLAIMER =
  "Gift cards are prepaid value, not cash — issuers generally do not refund, exchange or redeem them for money once purchased.";

/** "23:59" → "11:59 PM"; returns null when the input is not HH:MM. */
export function formatTimeAU(time: string | null | undefined): string | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time?.trim() ?? "");
  if (!match) return null;
  const hours24 = Number(match[1]);
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${match[2]} ${hours24 < 12 ? "AM" : "PM"}`;
}

/** "2026-07-17" + "23:59" + "AEST" → "17 July 2026, 11:59 PM AEST". */
export function formatExpiry(offer: GiftCardOffer): string | null {
  if (!offer.expiryDate) return null;
  const date = formatDateAU(offer.expiryDate);
  const time = formatTimeAU(offer.expiryTime);
  if (!time) return date;
  const zone = offer.expiryTimezone?.trim();
  return zone ? `${date}, ${time} ${zone}` : `${date}, ${time}`;
}

export function buildTermsRows(offer: GiftCardOffer): TermsRow[] {
  const rows: TermsRow[] = [];
  const add = (key: string, label: string, value: string | null, href?: string) =>
    rows.push(href ? { key, label, value, href } : { key, label, value });

  // Promo code — material whenever a code is required.
  if (offer.promoCode) {
    add("promo-code", "Promo code", offer.promoCode);
  } else if (offer.couponRequired) {
    add("promo-code", "Promo code", null); // required but not recorded
  }

  if (offer.startDate) {
    add("starts", "Starts", formatDateAU(offer.startDate));
  }
  add(
    "expires",
    "Expires",
    formatExpiry(offer) ?? (offer.isOngoing ? "Ongoing" : null)
  );

  if (offer.capDollars != null) {
    add(
      "purchase-cap",
      "Purchase cap",
      `Discount applies to the first $${offer.capDollars.toLocaleString("en-AU")} of gift-card value`
    );
  }
  if (offer.minSpend != null && offer.minSpend > 0) {
    add("min-spend", "Minimum spend", `$${offer.minSpend.toLocaleString("en-AU")}`);
  }
  if (offer.thresholdDollars != null && offer.thresholdDollars > 0) {
    add(
      "threshold",
      "Qualifying gift-card value",
      `$${offer.thresholdDollars.toLocaleString("en-AU")}`
    );
  }
  if (offer.promotionType === "promo-credit") {
    add("reward-destination", "Reward destination", "Future seller promo credit");
  } else if (offer.promotionType === "points") {
    add("reward-destination", "Reward destination", "Loyalty points (not cash)");
  } else if (offer.promotionType === "fee-waiver") {
    add("reward-destination", "Reward destination", "Waived purchase fee");
  } else if (offer.promotionType === "bonus-value") {
    add("reward-destination", "Reward destination", "Extra gift-card face value");
  }
  if (offer.denominationNote) {
    add(
      "denominations",
      "Denominations",
      sanitisePublicText(offer.denominationNote) || null
    );
  }

  if (offer.usesPerCustomer != null) {
    add(
      "uses-per-customer",
      "Uses per customer",
      offer.usesPerCustomer === 1 ? "One use" : `${offer.usesPerCustomer} uses`
    );
  } else if (offer.limitPerCustomer) {
    // Free-text field seeded from sample data in places — scrub dev wording
    // ("No stated cap (sample)") before it reaches the public table.
    add(
      "uses-per-customer",
      "Limit per customer",
      sanitisePublicText(offer.limitPerCustomer) || null
    );
  }

  if (offer.format && offer.format !== "unknown") {
    const label = {
      digital: "Digital cards",
      physical: "Physical cards",
      "digital-and-physical": "Physical and digital cards",
    }[offer.format];
    add("formats", "Eligible formats", label);
  }
  if (offer.shippingMayApply) {
    add("shipping", "Shipping", "Shipping fees may apply to physical cards");
  }
  if (offer.australiaOnly != null) {
    add(
      "geography",
      "Eligibility",
      offer.australiaOnly ? "Australian customers only" : "Not limited to Australia"
    );
  }
  if (offer.combinableWithSellerPromotions != null) {
    add(
      "combinability",
      "Other seller promotions",
      offer.combinableWithSellerPromotions
        ? "Can be combined with the seller's other promotions"
        : "Cannot be combined with another promotion from this seller"
    );
  }
  if (offer.membershipRequired) {
    add("membership", "Membership", "Eligible membership required");
  }
  if (offer.activationRequired) {
    add("activation", "Activation", "Offer must be activated before purchase");
  }

  add("early-withdrawal", "Refunds", EARLY_WITHDRAWAL_DISCLAIMER);

  if (offer.termsUrl) {
    add("terms-url", "Official terms", "Seller's terms and conditions", offer.termsUrl);
  } else {
    add("terms-url", "Official terms", null); // always material — verify at source
  }

  return rows;
}
