"use client";

import { useActionState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type { AdminGiftCardCandidate } from "@/lib/admin/repos/giftCardPipeline";
import {
  DUPLICATE_VERDICT_LABEL,
  type DuplicateMatch,
  type PublishedOfferSummary,
} from "@/lib/giftcards/duplicateDetection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  approveCandidate,
  attachDuplicateEvidence,
  archiveCandidate,
  markCandidateSourceUnavailable,
  markCandidateWithdrawn,
  markHistoricalCandidate,
  rejectCandidate,
  setLinkedOfferPublished,
  splitCandidateRevision,
  type ReviewActionState,
} from "@/app/admin/(protected)/gift-cards/review/actions";

/**
 * Client island for one gift-card review candidate. Uses useActionState so the
 * server actions' returned {error} surfaces inline (mirrors GiftCardForm) —
 * the server component that renders these cannot show action errors itself.
 * Every normalised value stays editable; nothing here auto-approves.
 */

const CHANGE_LABEL: Record<string, string> = {
  cosmetic: "Cosmetic change",
  "factual-non-material": "Non-material change",
  "material-offer": "Material offer change",
  "expiry-extension": "Expiry extended",
  eligibility: "Eligibility change",
  "stacking-condition": "Stacking condition change",
  "source-removed": "Removed at source",
};

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  readOnly = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <input
        name={name}
        type={type}
        step={type === "number" ? "0.1" : undefined}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        readOnly={readOnly}
        className="h-8 rounded-md border bg-background px-2 text-sm font-normal read-only:cursor-not-allowed read-only:bg-muted"
      />
    </label>
  );
}

function Check({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-medium">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

function AttachEvidenceButton({
  candidateId,
  offerId,
}: {
  candidateId: string;
  offerId: string;
}) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(
    attachDuplicateEvidence.bind(null, candidateId, offerId),
    {},
  );
  return (
    <form action={action} className="mt-1">
      {state.error ? <p role="alert" className="text-xs">{state.error}</p> : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Attaching…" : "Attach evidence to canonical offer"}
      </Button>
    </form>
  );
}

export function GiftCardReviewCard({
  candidate,
  stores,
  duplicates = [],
  publishedOffer = null,
}: {
  candidate: AdminGiftCardCandidate;
  stores: { id: string; name: string }[];
  duplicates?: DuplicateMatch[];
  publishedOffer?: PublishedOfferSummary | null;
}) {
  const [approveState, approve, approving] = useActionState<
    ReviewActionState,
    FormData
  >(approveCandidate.bind(null, candidate.id), {});
  const [rejectState, reject, rejecting] = useActionState<
    ReviewActionState,
    FormData
  >(rejectCandidate.bind(null, candidate.id), {});
  const [, archive, archiving] = useActionState<ReviewActionState, FormData>(
    () => archiveCandidate(candidate.id),
    {}
  );
  const [, markHistorical, markingHistorical] = useActionState<
    ReviewActionState,
    FormData
  >(() => markHistoricalCandidate(candidate.id), {});
  const [splitState, splitRevision, splitting] = useActionState<
    ReviewActionState,
    FormData
  >(splitCandidateRevision.bind(null, candidate.id), {});
  const [, sourceUnavailable, markingSourceUnavailable] = useActionState<
    ReviewActionState,
    FormData
  >(() => markCandidateSourceUnavailable(candidate.id), {});
  const [, markWithdrawn, markingWithdrawn] = useActionState<
    ReviewActionState,
    FormData
  >(() => markCandidateWithdrawn(candidate.id), {});
  const [, toggleLinkedOffer, togglingLinkedOffer] = useActionState<
    ReviewActionState,
    FormData
  >(
    () =>
      setLinkedOfferPublished(
        candidate.id,
        publishedOffer?.isPublished !== true,
      ),
    {},
  );
  const changed = candidate.reviewStatus === "changed";
  const hasExactDuplicate = duplicates.some(
    (match) => match.verdict === "exact-duplicate"
  );
  const compoundSummary =
    candidate.terms.candidateRole === "compound-summary" ||
    candidate.promotionType === "mixed";
  const sourceRemoved = candidate.terms.sourcePresence === "removed";
  const weekly = candidate.terms.weeklyFacts;
  const defaultRewardDestination =
    candidate.terms.rewardDestination ??
    ({
      discount: "checkout-discount",
      "fixed-dollar-discount": "checkout-discount",
      "bonus-value": "gift-card-value",
      points: "loyalty-points",
      "promo-credit": "seller-credit",
      "fee-waiver": "waived-fee",
      membership: "checkout-discount",
    }[candidate.promotionType] ?? "checkout-discount");

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Source item vs extraction */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{candidate.rawTitle}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {candidate.excerpt || "No source excerpt."}
            </p>
            {candidate.sourceUrl ? (
              <a
                href={candidate.sourceUrl}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Open source item <ExternalLink aria-hidden className="size-3" />
              </a>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={changed ? "destructive" : "secondary"}>
              {changed
                ? (CHANGE_LABEL[candidate.changeKind ?? ""] ?? "Changed at source")
                : "New candidate"}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              Parser confidence {(candidate.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {weekly ? (
          <dl className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-semibold text-muted-foreground">Weekly period</dt>
              <dd>{weekly.weekIdentifier ? `${weekly.weekIdentifier} · ` : ""}{weekly.startDate}–{weekly.endDate}</dd>
            </div>
            <div>
              <dt className="font-semibold text-muted-foreground">Discovery source</dt>
              <dd>Point Hacks · specialist editorial source</dd>
            </div>
            <div>
              <dt className="font-semibold text-muted-foreground">Retailer evidence</dt>
              <dd>{weekly.retailerCatalogueUrl ? "Attached" : "Missing — approval remains unverified"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-muted-foreground">Limits</dt>
              <dd>{[
                weekly.perCustomerLimit ? `${weekly.perCustomerLimit}/customer` : null,
                weekly.perMemberLimit ? `${weekly.perMemberLimit}/member` : null,
                weekly.perDayLimit ? `${weekly.perDayLimit}/day` : null,
              ].filter(Boolean).join(" · ") || "Not recorded"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-muted-foreground">Denominations</dt>
              <dd>{weekly.variableLoadRange ? `$${weekly.variableLoadRange.min}–$${weekly.variableLoadRange.max} variable load` : weekly.denominations.length ? weekly.denominations.map((value) => `$${value}`).join(", ") : "Not recorded"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-muted-foreground">Exclusions</dt>
              <dd>{[
                ...weekly.excludedDenominations.map((value) => `$${value}`),
                ...weekly.excludedCardVariants,
              ].join(", ") || "None recorded"}</dd>
            </div>
          </dl>
        ) : null}

        <details className="rounded-lg border bg-muted/20 p-3 text-xs">
          <summary className="cursor-pointer font-semibold">
            Stored raw snapshot
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words">
            {JSON.stringify(candidate.rawPayload ?? { title: candidate.rawTitle, excerpt: candidate.excerpt }, null, 2)}
          </pre>
          <p className="mt-2 text-muted-foreground">
            Candidate staged {new Date(candidate.createdAt).toLocaleString("en-AU")}.
          </p>
        </details>

        {changed && candidate.changedFields.length > 0 ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            Changed fields since the last extraction:{" "}
            <span className="font-medium">{candidate.changedFields.join(", ")}</span>
            {candidate.approvedOfferId
              ? ` — review against the approved offer ${candidate.approvedOfferId}.`
              : ""}
          </p>
        ) : null}

        {changed && publishedOffer ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="bg-muted/50"><tr><th className="p-2">Field</th><th className="p-2">Published</th><th className="p-2">Candidate</th></tr></thead>
              <tbody>
                {[
                  ["seller", publishedOffer.seller, candidate.sellerName],
                  ["cards", publishedOffer.brand, candidate.giftCardBrands.join(", ")],
                  ["mechanic", publishedOffer.promotionType, candidate.promotionType],
                  ["discount", publishedOffer.discountPercent, candidate.discountPercent],
                  ["bonus", publishedOffer.bonusPercent, candidate.bonusPercent],
                  ["points multiplier", publishedOffer.pointsMultiplier, candidate.pointsMultiplier],
                  ["fixed points", publishedOffer.fixedPoints, candidate.fixedPoints],
                  ["points programme", publishedOffer.pointsProgram, candidate.pointsProgram],
                  ["start date", publishedOffer.startDate, candidate.startsAt],
                  ["expiry date", publishedOffer.expiryDate, candidate.expiresAt],
                  ["denominations", publishedOffer.denominationNote, candidate.terms.weeklyFacts?.variableLoadRange ? `$${candidate.terms.weeklyFacts.variableLoadRange.min}–$${candidate.terms.weeklyFacts.variableLoadRange.max}` : candidate.terms.weeklyFacts?.denominations.join(", ") ?? null],
                  ["purchase limit", publishedOffer.limitPerCustomer, candidate.terms.purchaseLimitNote],
                  ["face-value cap", publishedOffer.capDollars, null],
                  ["exclusions", publishedOffer.usageNotes?.join("; "), weekly ? [...weekly.excludedDenominations.map((value) => `$${value}`), ...weekly.excludedCardVariants].join("; ") : null],
                  ["stack conditions", publishedOffer.stackNotes?.join("; "), null],
                  ["evidence", publishedOffer.sourceDetailUrl, candidate.sourceUrl],
                ].map(([field, before, after]) => (
                  <tr key={String(field)} className={String(before ?? "") !== String(after ?? "") ? "border-t bg-amber-500/[0.05]" : "border-t"}>
                    <th className="p-2 font-medium">{field}</th><td className="p-2 text-muted-foreground">{String(before ?? "Not recorded")}</td><td className="p-2">{String(after ?? "Not recorded")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {compoundSummary || sourceRemoved ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {sourceRemoved
              ? "This sub-offer disappeared from the fetched parent campaign. Review the linked public offer; this candidate cannot be approved."
              : "This is a private compound-campaign summary. Create separately keyed sub-offers for each mechanic, value, product set and eligibility rule before approval."}
          </p>
        ) : null}

        {duplicates.length > 0 ? (
          <ul className="space-y-1.5">
            {duplicates.map((match) => (
              <li
                key={match.offer.id}
                className={
                  match.verdict === "exact-duplicate"
                    ? "rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
                    : "rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300"
                }
              >
                <div className="flex flex-wrap items-center gap-1.5 font-medium">
                  <AlertTriangle aria-hidden className="size-3 shrink-0" />
                  {DUPLICATE_VERDICT_LABEL[match.verdict]} — {match.offer.id}
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 font-normal">
                  {match.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <AttachEvidenceButton
                  candidateId={candidate.id}
                  offerId={match.offer.id}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {candidate.warnings.length > 0 ? (
          <ul className="space-y-1">
            {candidate.warnings.map((warning) => (
              <li
                key={warning}
                className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                {warning}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Editable normalised values — the admin's values are authoritative. */}
        <form action={approve} className="space-y-3 border-t pt-3">
          {approveState?.error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {approveState.error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Brand" name="brand" defaultValue={candidate.giftCardBrands.join(", ") || null} />
            <Field label="Seller" name="seller" defaultValue={candidate.sellerName} />
            <label className="grid gap-1 text-xs font-medium">
              Promotion type
              <select
                name="promotion_type"
                defaultValue={
                  ["discount", "fixed-dollar-discount", "bonus-value", "points", "promo-credit", "fee-waiver", "membership", "mixed"].includes(candidate.promotionType)
                    ? candidate.promotionType
                    : "discount"
                }
                className="h-8 rounded-md border bg-background px-2 text-sm font-normal"
              >
                <option value="discount">Discount</option>
                <option value="fixed-dollar-discount">Fixed-dollar discount</option>
                <option value="bonus-value">Bonus value</option>
                <option value="points">Points</option>
                <option value="promo-credit">Seller promo credit</option>
                <option value="fee-waiver">Purchase-fee waiver</option>
                <option value="membership">Membership</option>
                <option value="mixed" disabled>Mixed / compound (cannot publish)</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Channel
              <select name="channel" defaultValue="supermarket-promo" className="h-8 rounded-md border bg-background px-2 text-sm font-normal">
                <option value="supermarket-promo">Supermarket promo</option>
                <option value="membership-portal">Membership portal</option>
                <option value="bank-benefit">Bank benefit</option>
              </select>
            </label>
            <Field label="Discount %" name="discount_percent" type="number" defaultValue={candidate.discountPercent} />
            <Field label="Bonus value %" name="bonus_percent" type="number" defaultValue={candidate.bonusPercent} />
            <Field label="Points multiplier" name="points_multiplier" type="number" defaultValue={candidate.pointsMultiplier} />
            <Field label="Fixed points" name="fixed_points" type="number" defaultValue={candidate.fixedPoints} />
            <Field label="Points programme" name="points_program" defaultValue={candidate.pointsProgram} />
            <Field label="Point value (cents)" name="points_value_cents" type="number" placeholder="0.5 = 2,000 pts → $10" />
            <Field label="Fixed discount $" name="fixed_discount_dollars" type="number" defaultValue={candidate.terms.fixedDiscountDollars ?? null} />
            <Field label="Seller promo credit $" name="promo_credit_dollars" type="number" defaultValue={candidate.terms.promoCreditDollars ?? null} />
            <Field label="Waived fee $" name="fee_waiver_dollars" type="number" defaultValue={candidate.terms.feeWaiverDollars ?? null} />
            <Field label="Qualifying threshold $" name="threshold_dollars" type="number" defaultValue={candidate.terms.thresholdDollars ?? null} />
            <label className="grid gap-1 text-xs font-medium">
              Reward destination
              <select name="reward_destination" defaultValue={defaultRewardDestination} className="h-8 rounded-md border bg-background px-2 text-sm font-normal">
                <option value="checkout-discount">Checkout discount</option>
                <option value="gift-card-value">Extra gift-card value</option>
                <option value="seller-credit">Seller promo credit</option>
                <option value="loyalty-points">Loyalty points</option>
                <option value="waived-fee">Waived purchase fee</option>
              </select>
            </label>
            <Field label="Start date" name="start_date" type="date" defaultValue={candidate.startsAt} />
            <Field label="Expiry date" name="expiry_date" type="date" defaultValue={candidate.expiresAt} />
            <Field label="Expiry time (24h)" name="expiry_time" placeholder="23:59" />
            <Field label="Expiry timezone" name="expiry_timezone" placeholder="AEST" />
            <Field label="Promo code" name="promo_code" placeholder="e.g. FEELING10" />
            <Field label="Min spend $" name="min_spend" type="number" defaultValue={candidate.terms.minSpend ?? null} />
            <Field label="Face-value cap $" name="cap_dollars" type="number" />
            <Field label="Uses per customer" name="uses_per_customer" type="number" placeholder="1" />
            <Field label="Limit per customer" name="limit_per_customer" defaultValue={candidate.terms.purchaseLimitNote ?? null} />
            <Field
              label="Denominations"
              name="denomination_note"
              defaultValue={
                weekly?.variableLoadRange
                  ? `$${weekly.variableLoadRange.min}–$${weekly.variableLoadRange.max} variable load`
                  : weekly?.denominations.length
                    ? weekly.denominations.map((value) => `$${value}`).join(", ")
                    : null
              }
              placeholder="e.g. $20–$500 variable load"
            />
            <label className="grid gap-1 text-xs font-medium">
              Format
              <select name="format" defaultValue="unknown" className="h-8 rounded-md border bg-background px-2 text-sm font-normal">
                <option value="unknown">Unknown</option>
                <option value="digital">Digital</option>
                <option value="physical">Physical</option>
                <option value="digital-and-physical">Digital & physical</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Australia only?
              <select name="australia_only" defaultValue="" className="h-8 rounded-md border bg-background px-2 text-sm font-normal">
                <option value="">Not stated</option>
                <option value="yes">Yes — AU customers only</option>
                <option value="no">No — broader eligibility</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Combines with other seller promos?
              <select name="combinable_with_seller_promotions" defaultValue="" className="h-8 rounded-md border bg-background px-2 text-sm font-normal">
                <option value="">Not stated</option>
                <option value="yes">Yes — combinable</option>
                <option value="no">No — one promotion only</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium">
              Accepted store ids (comma-separated)
              <input
                name="accepted_at_merchant_ids"
                list="store-ids"
                placeholder={stores.map((s) => s.id).slice(0, 4).join(", ")}
                className="h-8 rounded-md border bg-background px-2 text-sm font-normal"
              />
            </label>
            <Field label="Accepted at (display names)" name="accepted_at" placeholder="JB Hi-Fi, The Good Guys" />
            <Field
              label="Usage notes (comma/newline separated)"
              name="usage_notes"
              defaultValue={
                weekly
                  ? [
                      weekly.excludedDenominations.length
                        ? `Excluded denominations: ${weekly.excludedDenominations.map((value) => `$${value}`).join(", ")}`
                        : null,
                      weekly.excludedCardVariants.length
                        ? `Excluded variants: ${weekly.excludedCardVariants.join(", ")}`
                        : null,
                    ].filter(Boolean).join("; ") || null
                  : null
              }
            />
            <Field label="Stack notes" name="stack_notes" placeholder="e.g. Cashback usually excludes gift-card payment" />
            <Field
              label="Source URL (stored evidence)"
              name="source_url"
              defaultValue={candidate.sourceUrl}
              readOnly
            />
            <Field
              label="Retailer evidence / official terms URL"
              name="terms_url"
              defaultValue={weekly?.retailerCatalogueUrl ?? null}
              placeholder="https://seller.example/terms"
            />
            <Field
              label="Included product ids (comma-separated)"
              name="included_product_ids"
              placeholder="e.g. tcn-shop, tcn-love"
            />
            <Field
              label={candidate.approvedOfferId ? "Linked offer id" : "Offer id (blank = derived)"}
              name="offer_id"
              defaultValue={candidate.approvedOfferId ?? ""}
              readOnly={Boolean(candidate.approvedOfferId)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Check label="Membership required" name="membership_required" defaultChecked={candidate.terms.membershipRequired} />
            <Check label="Activation required" name="activation_required" defaultChecked={candidate.terms.activationRequired} />
            <Check label="Coupon required" name="coupon_required" defaultChecked={candidate.terms.couponRequired} />
            <Check label="Shipping may apply" name="shipping_may_apply" />
            <Check label="Ongoing offer (no expiry)" name="ongoing" />
            <Check label="Targeted (not generally available)" name="targeted" defaultChecked={candidate.terms.targeted} />
            {hasExactDuplicate ? (
              <Check label="I’ve reviewed the duplicate" name="duplicate_ack" />
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Approval is blocked without a seller, a promotion value, a source
            URL and an expiry date (or an explicit “Ongoing” tick). A source with
            more than 8 brands, a Prime/member-only offer without the membership
            flag, a fixed-dollar/promo-credit mechanic without its threshold, or an exact
            duplicate all block approval until resolved. MCC and
            merchant-acceptance evidence is managed on the gift-card product
            records, not per offer.
          </p>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button type="submit" size="sm" disabled={approving || compoundSummary || sourceRemoved}>
              {approving ? "Publishing…" : "Approve & publish"}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Publishes to gift_card_offers with your edited values (audited).
            </span>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <form action={reject} className="flex items-center gap-2">
            <input
              name="reason"
              placeholder="Rejection reason"
              className="h-8 w-48 rounded-md border bg-background px-2 text-xs"
            />
            <Button type="submit" size="sm" variant="outline" disabled={rejecting}>
              Reject
            </Button>
          </form>
          <form action={archive}>
            <Button type="submit" size="sm" variant="ghost" disabled={archiving}>
              Archive
            </Button>
          </form>
          <form action={markHistorical}>
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={markingHistorical}
            >
              Mark historical
            </Button>
          </form>
          <form action={sourceUnavailable}>
            <Button type="submit" size="sm" variant="ghost" disabled={markingSourceUnavailable}>
              Source unavailable
            </Button>
          </form>
          {publishedOffer ? (
            <>
              <form action={markWithdrawn}>
                <Button type="submit" size="sm" variant="destructive" disabled={markingWithdrawn}>
                  Mark withdrawn
                </Button>
              </form>
              <form action={toggleLinkedOffer}>
                <Button type="submit" size="sm" variant="outline" disabled={togglingLinkedOffer}>
                  {publishedOffer.isPublished === false ? "Restore linked offer" : "Archive linked offer"}
                </Button>
              </form>
            </>
          ) : null}
        </div>
        <form action={splitRevision} className="space-y-2 rounded-lg border p-3">
          <label className="grid gap-1 text-xs font-medium">
            Atomic sub-offer definitions (reviewed JSON)
            <textarea
              name="split_definitions"
              rows={5}
              placeholder={'[{"subOfferKey":"apple-credit","brand":"Apple","promotionType":"promo-credit","promoCreditDollars":10,"thresholdDollars":100},{"subOfferKey":"uber-discount","brand":"Uber","promotionType":"discount","discountPercent":10}]'}
              className="rounded-md border bg-background p-2 font-mono text-xs"
            />
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={splitting}>
            {splitting ? "Splitting…" : "Split merged revision"}
          </Button>
          {splitState.error ? <p role="alert" className="text-xs text-destructive">{splitState.error}</p> : null}
        </form>
        {rejectState?.error ? (
          <p role="alert" className="text-xs text-destructive">
            {rejectState.error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
