import Form from "next/form";
import Link from "next/link";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import FilterSelect from "@/components/deals/FilterSelect";
import type { Store } from "@/lib/data";
import {
  CATEGORY_LABEL,
  CATEGORY_SHORTCUTS,
  DEAL_KIND_FILTERS,
  DEAL_KIND_LABEL,
  MAX_PRICE_PRESETS,
  PROGRAMS,
  PROGRAM_LABEL,
  TRUST_FILTERS,
  TRUST_FILTER_LABEL,
  activeFilterCount,
  dealsHref,
  type DealsParams,
} from "@/lib/deals/params";

/**
 * Purchase-first filter bar: exactly four visible controls — Category, Store,
 * Price and "Stackable only" — updating results on change with no separate
 * Apply button. Everything else lives in one "All filters" drawer. Selected
 * filters render as removable chips above the results (ActiveFilters in
 * app/deals/page.tsx).
 */

const clearOverrides: Partial<DealsParams> = {
  cat: null,
  maxPrice: null,
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

/** Carry non-filter state through a filter form submission. */
function HiddenState({
  params,
  omit = [],
}: {
  params: DealsParams;
  omit?: Array<keyof DealsParams>;
}) {
  const keep = (key: keyof DealsParams) => !omit.includes(key);
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
      {keep("cat") && params.cat ? (
        <input type="hidden" name="cat" value={params.cat} />
      ) : null}
      {keep("maxPrice") && params.maxPrice != null ? (
        <input type="hidden" name="maxPrice" value={params.maxPrice} />
      ) : null}
      {keep("merchant") && params.merchant ? (
        <input type="hidden" name="merchant" value={params.merchant} />
      ) : null}
      {keep("stackable") && params.stackable ? (
        <input type="hidden" name="stackable" value="1" />
      ) : null}
      {keep("kind") && params.kind ? (
        <input type="hidden" name="kind" value={params.kind} />
      ) : null}
      {keep("program") && params.program ? (
        <input type="hidden" name="program" value={params.program} />
      ) : null}
      {keep("trust") && params.trust ? (
        <input type="hidden" name="trust" value={params.trust} />
      ) : null}
      {keep("coupon") && params.coupon ? (
        <input type="hidden" name="coupon" value="1" />
      ) : null}
      {keep("membership") && params.membership ? (
        <input type="hidden" name="membership" value="1" />
      ) : null}
      {keep("activation") && params.activation ? (
        <input type="hidden" name="activation" value="1" />
      ) : null}
      {keep("targeted") && params.targeted ? (
        <input type="hidden" name="targeted" value="1" />
      ) : null}
      {keep("added") && params.added ? (
        <input type="hidden" name="added" value={params.added} />
      ) : null}
      {keep("channel") && params.channel ? (
        <input type="hidden" name="channel" value={params.channel} />
      ) : null}
      {keep("ending") && params.ending ? (
        <input type="hidden" name="ending" value={params.ending} />
      ) : null}
      {keep("minSaving") && params.minSaving != null ? (
        <input type="hidden" name="minSaving" value={params.minSaving} />
      ) : null}
    </>
  );
}

/** The advanced controls, shown only inside the drawer. */
function AdvancedFields({ params, id }: { params: DealsParams; id: string }) {
  const select = (
    fieldId: string,
    label: string,
    name: string,
    defaultValue: string | number,
    children: React.ReactNode,
  ) => (
    <label
      className="grid min-w-0 gap-1 text-[11px] font-semibold"
      htmlFor={fieldId}
    >
      {label}
      <select
        id={fieldId}
        name={name}
        defaultValue={defaultValue}
        className="h-9 min-w-0 rounded-lg border bg-background px-2 text-xs font-medium"
      >
        {children}
      </select>
    </label>
  );
  return (
    <>
      {select(
        `${id}-kind`,
        "Saving type",
        "kind",
        params.kind ?? "",
        <>
          <option value="">All types</option>
          {DEAL_KIND_FILTERS.map((kind) => (
            <option key={kind} value={kind}>
              {DEAL_KIND_LABEL[kind]}
            </option>
          ))}
        </>,
      )}
      {select(
        `${id}-program`,
        "Points programme",
        "program",
        params.program ?? "",
        <>
          <option value="">All programmes</option>
          {PROGRAMS.map((program) => (
            <option key={program} value={program}>
              {PROGRAM_LABEL[program]}
            </option>
          ))}
        </>,
      )}
      {select(
        `${id}-channel`,
        "Where to buy",
        "channel",
        params.channel ?? "",
        <>
          <option value="">Online or in-store</option>
          <option value="online">Online</option>
          <option value="in-store">In-store</option>
        </>,
      )}
      {select(
        `${id}-trust`,
        "Source status",
        "trust",
        params.trust ?? "",
        <>
          <option value="">Any status</option>
          {TRUST_FILTERS.map((trust) => (
            <option key={trust} value={trust}>
              {TRUST_FILTER_LABEL[trust]}
            </option>
          ))}
        </>,
      )}
      {select(
        `${id}-ending`,
        "Ending",
        "ending",
        params.ending ?? "",
        <>
          <option value="">Any date</option>
          <option value="72h">Next 72 hours</option>
          <option value="week">Next 7 days</option>
        </>,
      )}
      {select(
        `${id}-min-saving`,
        "Minimum saving",
        "minSaving",
        params.minSaving ?? "",
        <>
          <option value="">Any saving</option>
          <option value="5">5%+</option>
          <option value="10">10%+</option>
          <option value="20">20%+</option>
        </>,
      )}
      {select(
        `${id}-added`,
        "Added",
        "added",
        params.added ?? "",
        <>
          <option value="">Any time</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
        </>,
      )}
      <fieldset className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-2">
        <legend className="sr-only">Offer conditions</legend>
        {[
          ["coupon", "Coupon", params.coupon],
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
      {/* The four visible controls: Category · Store · Price · Stackable only. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Form
          action="/deals"
          className="flex min-w-0 flex-wrap items-end gap-3"
        >
          <HiddenState
            params={params}
            omit={["cat", "merchant", "maxPrice"]}
          />
          <FilterSelect
            id="deal-cat"
            label="Category"
            name="cat"
            defaultValue={params.cat ?? ""}
          >
            <option value="">All categories</option>
            {CATEGORY_SHORTCUTS.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABEL[cat]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            id="deal-merchant"
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
          </FilterSelect>
          <FilterSelect
            id="deal-max-price"
            label="Price"
            name="maxPrice"
            defaultValue={params.maxPrice ?? ""}
          >
            <option value="">Any price</option>
            {MAX_PRICE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                Up to ${preset.toLocaleString("en-AU")}
              </option>
            ))}
          </FilterSelect>
          {/* No-JS fallback — visually hidden, still focusable for keyboards. */}
          <Button type="submit" size="sm" variant="outline" className="sr-only">
            Apply
          </Button>
        </Form>
        {/* A link toggle navigates URL state; aria-pressed is button-only
            ARIA, so the active state is conveyed with aria-current instead. */}
        <Link
          href={dealsHref(params, { stackable: !params.stackable })}
          aria-current={params.stackable ? "true" : undefined}
          className={
            params.stackable
              ? "inline-flex h-9 items-center rounded-lg border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white"
              : "inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          }
        >
          Stackable only
        </Link>
        {count > 0 ? (
          <Link
            href={dealsHref(params, clearOverrides)}
            className="inline-flex h-9 items-center gap-1 px-1 text-xs font-semibold text-emerald-700 hover:underline"
          >
            <X aria-hidden className="size-3" /> Clear all
          </Link>
        ) : null}
      </div>

      {/* Everything else in one drawer. */}
      <details className="rounded-xl border bg-card shadow-sm">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="inline-flex items-center gap-2">
            <Filter aria-hidden className="size-4" /> All filters
            {count ? ` (${count} active)` : ""}
          </span>
          <span aria-hidden>+</span>
        </summary>
        <Form
          action="/deals"
          className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <HiddenState
            params={params}
            omit={[
              "kind",
              "program",
              "trust",
              "coupon",
              "membership",
              "activation",
              "targeted",
              "added",
              "channel",
              "ending",
              "minSaving",
            ]}
          />
          <AdvancedFields params={params} id="drawer" />
          <div className="col-span-full flex gap-2">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link href={dealsHref(params, clearOverrides)}>Clear</Link>
            </Button>
          </div>
        </Form>
      </details>
    </div>
  );
}
