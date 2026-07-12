"use client";

import { useActionState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type { AdminGiftCardCandidate } from "@/lib/admin/repos/giftCardPipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  approveCandidate,
  archiveCandidate,
  rejectCandidate,
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
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
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
        className="h-8 rounded-md border bg-background px-2 text-sm font-normal"
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

export function GiftCardReviewCard({
  candidate,
  stores,
}: {
  candidate: AdminGiftCardCandidate;
  stores: { id: string; name: string }[];
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
  const changed = candidate.reviewStatus === "changed";

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

        {changed && candidate.changedFields.length > 0 ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            Changed fields since the last extraction:{" "}
            <span className="font-medium">{candidate.changedFields.join(", ")}</span>
            {candidate.approvedOfferId
              ? ` — review against the approved offer ${candidate.approvedOfferId}.`
              : ""}
          </p>
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
                  ["discount", "bonus-value", "points", "membership"].includes(candidate.promotionType)
                    ? candidate.promotionType
                    : "discount"
                }
                className="h-8 rounded-md border bg-background px-2 text-sm font-normal"
              >
                <option value="discount">Discount</option>
                <option value="bonus-value">Bonus value</option>
                <option value="points">Points</option>
                <option value="membership">Membership</option>
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
            <Field label="Points programme" name="points_program" defaultValue={candidate.pointsProgram} />
            <Field label="Point value (cents)" name="points_value_cents" type="number" placeholder="0.5 = 2,000 pts → $10" />
            <Field label="Start date" name="start_date" type="date" defaultValue={candidate.startsAt} />
            <Field label="Expiry date" name="expiry_date" type="date" defaultValue={candidate.expiresAt} />
            <Field label="Min spend $" name="min_spend" type="number" defaultValue={candidate.terms.minSpend ?? null} />
            <Field label="Face-value cap $" name="cap_dollars" type="number" />
            <Field label="Limit per customer" name="limit_per_customer" defaultValue={candidate.terms.purchaseLimitNote ?? null} />
            <Field label="Denominations" name="denomination_note" placeholder="e.g. $20–$500 variable load" />
            <label className="grid gap-1 text-xs font-medium">
              Format
              <select name="format" defaultValue="unknown" className="h-8 rounded-md border bg-background px-2 text-sm font-normal">
                <option value="unknown">Unknown</option>
                <option value="digital">Digital</option>
                <option value="physical">Physical</option>
                <option value="digital-and-physical">Digital & physical</option>
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
            <Field label="Usage notes (comma/newline separated)" name="usage_notes" />
            <Field label="Stack notes" name="stack_notes" placeholder="e.g. Cashback usually excludes gift-card payment" />
            <Field label="Source URL" name="source_url" defaultValue={candidate.sourceUrl} />
            <Field label="Offer id (blank = derived)" name="offer_id" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Check label="Membership required" name="membership_required" defaultChecked={candidate.terms.membershipRequired} />
            <Check label="Activation required" name="activation_required" defaultChecked={candidate.terms.activationRequired} />
            <Check label="Coupon required" name="coupon_required" defaultChecked={candidate.terms.couponRequired} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button type="submit" size="sm" disabled={approving}>
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
        </div>
        {rejectState?.error ? (
          <p role="alert" className="text-xs text-destructive">
            {rejectState.error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
