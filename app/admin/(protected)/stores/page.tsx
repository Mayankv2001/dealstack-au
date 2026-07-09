import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { listStores, type AdminStore } from "@/lib/admin/repos/stores";
import {
  AdminListTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminListTable";
import { Button } from "@/components/ui/button";
import { setPublished } from "./actions";

export const metadata: Metadata = {
  title: "Stores | DealStack AU admin",
};

const COLUMNS: AdminColumn[] = [
  { key: "store", header: "Store" },
  { key: "category", header: "Category" },
  { key: "offers", header: "Best rates" },
  { key: "sort", header: "Sort" },
  { key: "status", header: "Status" },
];

/** Compact "best rates" summary so the list is scannable without opening a row. */
function ratesSummary(store: AdminStore): string {
  const parts: string[] = [];
  if (store.discountPercent > 0) parts.push(`${store.discountPercent}% off`);
  if (store.cashbackPercent > 0) {
    parts.push(`${store.cashbackPercent}% CB`);
  }
  if (store.giftCardDiscountPercent > 0) {
    parts.push(`${store.giftCardDiscountPercent}% GC`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function toRow(store: AdminStore): AdminRow {
  return {
    id: store.id,
    searchText: `${store.name} ${store.id} ${store.category}`.toLowerCase(),
    filterValue: store.isPublished ? "published" : "unpublished",
    editHref: `/admin/stores/${store.id}/edit`,
    cells: {
      store: { kind: "text", text: `${store.name} · ${store.id}`, strong: true },
      category: { kind: "text", text: store.category },
      offers: { kind: "text", text: ratesSummary(store), muted: true },
      sort: { kind: "text", text: String(store.sortOrder), muted: true },
      status: {
        kind: "badges",
        items: [
          store.isPublished
            ? { text: "Published", tone: "secondary" }
            : { text: "Unpublished", tone: "outline" },
        ],
      },
    },
    actions: [
      {
        action: setPublished.bind(null, store.id, !store.isPublished),
        label: store.isPublished ? "Unpublish" : "Publish",
      },
    ],
  };
}

export default async function StoreListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const stores = await listStores();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Stores</h1>
          <p className="text-sm text-muted-foreground">
            Core content — every store powers a store page, the homepage grid,
            search and stack calculations. New stores go live without a re-seed.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/stores/new">New store</Link>
        </Button>
      </header>

      <div className="w-full rounded-r-md border-l-4 border-amber-500 bg-amber-50/50 p-3 dark:bg-amber-950/25">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-400">
              Unpublish, don&rsquo;t delete
            </p>
            <p className="text-[11px] leading-normal text-muted-foreground/80">
              Unpublishing hides the store page and the store-grid entry, but
              offers referencing this store stay published — unpublish those
              separately. The store id is permanent (it is the public URL and how
              offers link here), so it cannot be changed after creation.
            </p>
          </div>
        </div>
      </div>

      {stores.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No stores yet.{" "}
          <Link href="/admin/stores/new" className="font-medium underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <AdminListTable
          columns={COLUMNS}
          rows={stores.map((store) => toRow(store))}
          searchPlaceholder="Search name, id, category…"
          filter={{
            label: "Status",
            options: [
              { value: "published", label: "Published" },
              { value: "unpublished", label: "Unpublished" },
            ],
          }}
        />
      )}

      <p className="text-[11px] leading-normal text-muted-foreground/70">
        Note: stores whose id also exists in the static seed data
        (<code className="font-mono">lib/data.ts</code>) are reset by{" "}
        <code className="font-mono">npm run seed -- --overwrite</code>. A plain{" "}
        <code className="font-mono">npm run seed</code> is insert-only and leaves
        admin-edited stores untouched.
      </p>
    </div>
  );
}
