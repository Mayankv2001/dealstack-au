import Form from "next/form";
import Link from "next/link";
import { Filter, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/data";
import {
  DEAL_KIND_FILTERS,
  DEAL_KIND_LABEL,
  PROGRAMS,
  PROGRAM_LABEL,
  TRUST_FILTERS,
  TRUST_FILTER_LABEL,
  activeFilterCount,
  dealsHref,
  type DealsParams,
} from "@/lib/deals/params";

const clearOverrides: Partial<DealsParams> = {
  merchant: null,
  kind: null,
  program: null,
  trust: null,
  coupon: false,
  stackable: false,
  membership: false,
  activation: false,
  targeted: false,
  added: null,
  channel: null,
  ending: null,
  minSaving: null,
};

function HiddenState({ params }: { params: DealsParams }) {
  return (
    <>
      {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
      {params.view !== "discover" ? (
        <input type="hidden" name="view" value={params.view} />
      ) : null}
      {params.sort !== "recommended" ? (
        <input type="hidden" name="sort" value={params.sort} />
      ) : null}
      {params.spend !== 500 ? (
        <input type="hidden" name="spend" value={params.spend} />
      ) : null}
    </>
  );
}

function SelectField({
  id,
  label,
  name,
  defaultValue,
  children,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string | number;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-[11px] font-semibold" htmlFor={id}>
      {label}
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="h-9 min-w-0 rounded-lg border bg-background px-2 text-xs font-medium"
      >
        {children}
      </select>
    </label>
  );
}

function FilterFields({
  params,
  stores,
  id,
}: {
  params: DealsParams;
  stores: Store[];
  id: string;
}) {
  return (
    <>
      <SelectField
        id={`${id}-merchant`}
        label="Store"
        name="merchant"
        defaultValue={params.merchant ?? ""}
      >
        <option value="">All stores</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        id={`${id}-kind`}
        label="Saving type"
        name="kind"
        defaultValue={params.kind ?? ""}
      >
        <option value="">All types</option>
        {DEAL_KIND_FILTERS.map((kind) => (
          <option key={kind} value={kind}>
            {DEAL_KIND_LABEL[kind]}
          </option>
        ))}
      </SelectField>
      <SelectField
        id={`${id}-program`}
        label="Points programme"
        name="program"
        defaultValue={params.program ?? ""}
      >
        <option value="">All programmes</option>
        {PROGRAMS.map((program) => (
          <option key={program} value={program}>
            {PROGRAM_LABEL[program]}
          </option>
        ))}
      </SelectField>
      <SelectField
        id={`${id}-channel`}
        label="Where to buy"
        name="channel"
        defaultValue={params.channel ?? ""}
      >
        <option value="">Online or in-store</option>
        <option value="online">Online</option>
        <option value="in-store">In-store</option>
      </SelectField>
      <SelectField
        id={`${id}-trust`}
        label="Source status"
        name="trust"
        defaultValue={params.trust ?? ""}
      >
        <option value="">Any status</option>
        {TRUST_FILTERS.map((trust) => (
          <option key={trust} value={trust}>
            {TRUST_FILTER_LABEL[trust]}
          </option>
        ))}
      </SelectField>
      <SelectField
        id={`${id}-ending`}
        label="Ending"
        name="ending"
        defaultValue={params.ending ?? ""}
      >
        <option value="">Any date</option>
        <option value="72h">Next 72 hours</option>
        <option value="week">Next 7 days</option>
      </SelectField>
      <SelectField
        id={`${id}-min-saving`}
        label="Minimum saving"
        name="minSaving"
        defaultValue={params.minSaving ?? ""}
      >
        <option value="">Any saving</option>
        <option value="5">5%+</option>
        <option value="10">10%+</option>
        <option value="20">20%+</option>
      </SelectField>
      <SelectField
        id={`${id}-added`}
        label="Added"
        name="added"
        defaultValue={params.added ?? ""}
      >
        <option value="">Any time</option>
        <option value="today">Today</option>
        <option value="week">This week</option>
      </SelectField>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:col-span-4 xl:col-span-8">
        <legend className="sr-only">Offer conditions</legend>
        {[
          ["coupon", "Coupon", params.coupon],
          ["stackable", "Has planning layers", params.stackable],
          ["membership", "Membership required", params.membership],
          ["activation", "Activation required", params.activation],
          ["targeted", "Targeted", params.targeted],
        ].map(([name, label, checked]) => (
          <label
            key={String(name)}
            className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium"
          >
            <input
              type="checkbox"
              name={String(name)}
              value="1"
              defaultChecked={Boolean(checked)}
              className="size-4 accent-emerald-600"
            />
            {String(label)}
          </label>
        ))}
      </fieldset>
    </>
  );
}

function FilterForm({
  params,
  stores,
  id,
}: {
  params: DealsParams;
  stores: Store[];
  id: string;
}) {
  return (
    <Form
      action="/deals"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
    >
      <HiddenState params={params} />
      <FilterFields params={params} stores={stores} id={id} />
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-8">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        <Button asChild type="button" size="sm" variant="outline">
          <Link href={dealsHref(params, clearOverrides)}>Clear</Link>
        </Button>
      </div>
    </Form>
  );
}

/** Compact controls preserve the scan-first deal list: no desktop sidebar
 * consumes a results column, while mobile keeps the same controls in a native,
 * keyboard-accessible disclosure. */
export function DealsFilters({
  params,
  stores,
}: {
  params: DealsParams;
  stores: Store[];
}) {
  const count = activeFilterCount(params);
  return (
    <div className="space-y-3">
      <section
        className="hidden rounded-xl border bg-card p-4 shadow-sm lg:block"
        aria-labelledby="desktop-deal-filters"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="desktop-deal-filters"
            className="flex items-center gap-2 text-sm font-bold"
          >
            <SlidersHorizontal aria-hidden className="size-4" /> Refine results
          </h2>
          <p className="text-xs text-muted-foreground">
            {count ? `${count} active` : "All current offers"}
          </p>
        </div>
        <FilterForm params={params} stores={stores} id="desktop" />
      </section>

      <details className="rounded-xl border bg-card shadow-sm lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="inline-flex items-center gap-2">
            <Filter aria-hidden className="size-4" /> Filters
            {count ? `(${count})` : ""}
          </span>
          <span aria-hidden>+</span>
        </summary>
        <div className="border-t p-4">
          <FilterForm params={params} stores={stores} id="mobile" />
        </div>
      </details>

      {count > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {count} active {count === 1 ? "filter" : "filters"}
          </span>
          <Link
            href={dealsHref(params, clearOverrides)}
            className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
          >
            <X aria-hidden className="size-3" /> Clear all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
