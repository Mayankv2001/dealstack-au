import Form from "next/form";
import Link from "next/link";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/data";
import {
  PROGRAM_LABEL,
  PROGRAMS,
  TRUST_FILTER_LABEL,
  TRUST_FILTERS,
  activeFilterCount,
  dealsHref,
  type DealsParams,
} from "@/lib/deals/params";

function HiddenState({ params }: { params: DealsParams }) {
  return <>{params.q ? <input type="hidden" name="q" value={params.q} /> : null}{params.view !== "discover" ? <input type="hidden" name="view" value={params.view} /> : null}{params.sort !== "recommended" ? <input type="hidden" name="sort" value={params.sort} /> : null}</>;
}

function FilterFields({ params, stores, id }: { params: DealsParams; stores: Store[]; id: string }) {
  return (
    <>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${id}-merchant`}>
        Merchant
        <select id={`${id}-merchant`} name="merchant" defaultValue={params.merchant ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm">
          <option value="">All merchants</option>
          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${id}-program`}>
        Loyalty programme
        <select id={`${id}-program`} name="program" defaultValue={params.program ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm">
          <option value="">All programmes</option>
          {PROGRAMS.map((program) => <option key={program} value={program}>{PROGRAM_LABEL[program]}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${id}-trust`}>
        Trust status
        <select id={`${id}-trust`} name="trust" defaultValue={params.trust ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm">
          <option value="">Any public status</option>
          {TRUST_FILTERS.map((trust) => <option key={trust} value={trust}>{TRUST_FILTER_LABEL[trust]}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${id}-added`}>
        Added
        <select id={`${id}-added`} name="added" defaultValue={params.added ?? ""} className="h-9 rounded-lg border bg-background px-2 text-sm">
          <option value="">Any time</option><option value="today">Today</option><option value="week">This week</option>
        </select>
      </label>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-medium">Offer features</legend>
        {[
          ["coupon", "Coupon available", params.coupon],
          ["stackable", "Stackable", params.stackable],
          ["membership", "Membership required", params.membership],
          ["activation", "Activation required", params.activation],
          ["targeted", "Targeted offer", params.targeted],
        ].map(([name, label, checked]) => (
          <label key={String(name)} className="flex min-h-8 items-center gap-2 text-sm">
            <input type="checkbox" name={String(name)} value="1" defaultChecked={Boolean(checked)} className="size-4 accent-emerald-600" />{String(label)}
          </label>
        ))}
      </fieldset>
    </>
  );
}

function FilterForm({ params, stores, id }: { params: DealsParams; stores: Store[]; id: string }) {
  return (
    <Form action="/deals" className="grid gap-4">
      <HiddenState params={params} />
      <FilterFields params={params} stores={stores} id={id} />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Apply filters</Button>
        <Button asChild type="button" variant="outline"><Link href={dealsHref(params, { merchant: null, program: null, trust: null, coupon: false, stackable: false, membership: false, activation: false, targeted: false, added: null })}>Clear</Link></Button>
      </div>
    </Form>
  );
}

export function DealsFilters({ params, stores }: { params: DealsParams; stores: Store[] }) {
  const count = activeFilterCount(params);
  return (
    <>
      <aside className="hidden w-56 shrink-0 lg:block" aria-label="Deal filters">
        <div className="sticky top-20 rounded-xl border bg-card p-4"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Filter aria-hidden className="size-4" /> Filters {count ? <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{count}</span> : null}</h2><FilterForm params={params} stores={stores} id="desktop" /></div>
      </aside>
      <details className="rounded-lg border bg-card lg:hidden">
        <summary tabIndex={0} className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="inline-flex items-center gap-2"><Filter aria-hidden className="size-4" /> Filters {count ? `(${count})` : ""}</span><span aria-hidden>+</span>
        </summary>
        <div className="border-t p-4"><FilterForm params={params} stores={stores} id="mobile" /></div>
      </details>
      {count > 0 ? <div className="flex flex-wrap items-center gap-2 text-xs lg:hidden"><span>{count} active filter{count === 1 ? "" : "s"}</span><Link href={dealsHref(params, { merchant: null, program: null, trust: null, coupon: false, stackable: false, membership: false, activation: false, targeted: false, added: null })} className="inline-flex items-center gap-1 text-primary hover:underline"><X aria-hidden className="size-3" /> Clear all</Link></div> : null}
    </>
  );
}
