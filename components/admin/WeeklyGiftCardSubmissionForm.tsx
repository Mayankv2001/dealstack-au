"use client";

import { useActionState } from "react";
import {
  submitWeeklyCandidate,
  restrictWeeklySource,
  type ReviewActionState,
  type WeeklySubmissionState,
} from "@/app/admin/(protected)/gift-cards/review/actions";
import { POINT_HACKS_WEEKLY_URL } from "@/lib/giftcards/pointHacksWeekly";
import { Button } from "@/components/ui/button";

const initialState: WeeklySubmissionState = {};

function Input({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        step={type === "number" ? "any" : undefined}
        className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm font-normal"
      />
    </label>
  );
}

export function WeeklyGiftCardSubmissionForm({
  sourceInstalled,
  automatedFetchAllowed,
  lastSuccessAt,
  lastFailureAt,
  lastFailure,
}: {
  sourceInstalled: boolean;
  automatedFetchAllowed: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
}) {
  const [state, action, pending] = useActionState(
    submitWeeklyCandidate,
    initialState,
  );
  const [restrictionState, restrictionAction, restricting] = useActionState<
    ReviewActionState,
    FormData
  >(() => restrictWeeklySource(), {});
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold">
        Submit weekly supermarket offer facts
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Admin-assisted mode stores structured facts and evidence privately. It
        performs no network request and never auto-publishes. Automated fetch is
        currently {automatedFetchAllowed ? "permitted" : "not permitted"}.
      </p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md bg-muted/50 p-2">
          <dt className="font-semibold">Source role</dt>
          <dd className="mt-0.5 text-muted-foreground">Specialist editorial discovery</dd>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <dt className="font-semibold">Last successful retrieval</dt>
          <dd className="mt-0.5 text-muted-foreground">{lastSuccessAt ?? "Never"}</dd>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <dt className="font-semibold">Last failed retrieval</dt>
          <dd className="mt-0.5 text-muted-foreground">
            {lastFailureAt ? `${lastFailureAt}${lastFailure ? ` · ${lastFailure}` : ""}` : "Never"}
          </dd>
        </div>
      </dl>
      {sourceInstalled ? (
        <form action={restrictionAction} className="mt-2">
          {restrictionState.error ? (
            <p role="alert" className="mb-2 text-xs text-destructive">
              {restrictionState.error}
            </p>
          ) : null}
          <Button type="submit" size="sm" variant="outline" disabled={restricting}>
            {restricting
              ? "Recording…"
              : "Record restriction and disable automated retrieval"}
          </Button>
        </form>
      ) : null}
      {!sourceInstalled ? (
        <p role="status" className="mt-3 rounded-md bg-amber-500/10 p-2 text-xs text-amber-800">
          Source configuration migration 027 is not installed. Submission will
          fail closed until that migration receives separate approval.
        </p>
      ) : null}
      <form action={action} className="mt-4 space-y-4">
        {state.error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p role="status" className="rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-800">
            {state.success}
          </p>
        ) : null}
        <input type="hidden" name="discoverySourceUrl" value={POINT_HACKS_WEEKLY_URL} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Week identifier" name="weekIdentifier" placeholder="Week 29" />
          <Input label="Start date" name="startDate" type="date" required />
          <Input label="End date" name="endDate" type="date" required />
          <Input label="Source publication date" name="sourcePublishedAt" type="date" />
          <label className="grid gap-1 text-xs font-semibold">
            Seller
            <select name="seller" required className="h-9 rounded-md border bg-background px-2 text-sm font-normal">
              <option value="">Choose seller</option>
              <option>Coles</option>
              <option>Woolworths</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Loyalty programme
            <select name="loyaltyProgramme" className="h-9 rounded-md border bg-background px-2 text-sm font-normal">
              <option value="">None recorded</option>
              <option>Flybuys</option>
              <option>Everyday Rewards</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Promotion type
            <select name="promotionType" required className="h-9 rounded-md border bg-background px-2 text-sm font-normal">
              <option value="discount">Direct percentage discount</option>
              <option value="bonus-value">Bonus card value</option>
              <option value="points">Points multiplier</option>
              <option value="fixed-points">Fixed bonus points</option>
              <option value="mixed">Mixed / conditional</option>
            </select>
          </label>
          <Input label="Gift-card brands" name="giftCardBrands" required placeholder="Apple, Myer" />
          <Input label="Discount %" name="discountPercent" type="number" />
          <Input label="Bonus value %" name="bonusPercent" type="number" />
          <Input label="Points multiplier" name="pointsMultiplier" type="number" />
          <Input label="Fixed bonus points" name="fixedPoints" type="number" />
          <Input label="Denominations" name="denominations" placeholder="50, 100" />
          <Input label="Variable-load minimum $" name="variableLoadMin" type="number" />
          <Input label="Variable-load maximum $" name="variableLoadMax" type="number" />
          <Input label="Per-customer limit" name="perCustomerLimit" type="number" />
          <Input label="Per-member limit" name="perMemberLimit" type="number" />
          <Input label="Per-day limit" name="perDayLimit" type="number" />
          <Input label="Excluded denominations" name="excludedDenominations" placeholder="20, 500" />
          <Input label="Excluded variants" name="excludedCardVariants" placeholder="Variable-load card" />
          <div className="sm:col-span-2 lg:col-span-4">
            <Input label="Retailer catalogue or promotion evidence" name="retailerCatalogueUrl" type="url" placeholder="https://…" />
          </div>
        </div>
        <Button type="submit" disabled={pending || !sourceInstalled}>
          {pending ? "Staging…" : "Stage for review"}
        </Button>
      </form>
    </details>
  );
}
