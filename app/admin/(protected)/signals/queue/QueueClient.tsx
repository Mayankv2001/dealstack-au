"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  Gauge,
  RefreshCw,
  Rss,
  Search,
  Store as StoreIcon,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/admin/ActionButton";
import type {
  FeedApprovalOverrides,
  FeedQueueItem,
} from "@/lib/admin/repos/feedQueue";
import type { DealKind } from "@/lib/sources/types";
import { assessFeedItem, type Relevance } from "@/lib/admin/queueRelevance";
import {
  feedQueueBrandOptions,
  feedQueueSelectionIds,
  filterFeedQueueItems,
  NO_BRAND_FILTER,
} from "@/lib/admin/feedQueueFilters";
import { cn } from "@/lib/utils";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import {
  approveItem,
  approveSelectedItems,
  hideFromTopDeals,
  rejectItem,
  rejectSelectedItems,
  showInTopDeals,
} from "./actions";

/**
 * Client review island for the deal review queue.
 *
 * The server page owns the (service-role) data fetch and passes the staged items
 * in. This component adds in-memory search/filtering and selection-scoped bulk
 * actions. Fetching never happens in the browser. Approval is the single human
 * publication step; rejection archives the source row without deleting it.
 */

// Deterministic AU-local timestamps (fixed timeZone → no hydration mismatch).
const QUEUE_DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function formatDate(iso: string | null): string {
  return iso ? QUEUE_DATE_FMT.format(new Date(iso)) : "—";
}

/** Hostname of an external link, for a safer "where does this go" display. */
function safeHost(url: string): string | null {
  const safeUrl = safeHttpsUrl(url);
  return safeUrl ? new URL(safeUrl).hostname : null;
}

// ── Review-assist heuristics (display only — never auto-import or reject) ──────

const RELEVANCE_META: Record<
  Relevance,
  { label: string; className: string }
> = {
  high: {
    label: "High relevance",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  medium: {
    label: "Medium relevance",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  low: {
    label: "Low relevance",
    className: "border-muted-foreground/30 text-muted-foreground",
  },
};

/** Quick keyword presets for the merchants / deal types we care about. */
const PRESETS = [
  // Merchants
  "Qantas",
  "JB Hi-Fi",
  "Amazon",
  "Coles",
  "Woolworths",
  "Officeworks",
  "The Good Guys",
  "Costco",
  // Priority categories (tech, fashion, beauty, automotive, household)
  "Tech",
  "Electronics",
  "Appliances",
  "Fashion",
  "Beauty",
  "Perfume",
  "Automotive",
  "Household",
  "Grocery",
  // Deal types
  "gift card",
  "cashback",
  "points",
  // Broader source expansion: bank/card offers, loyalty programmes, cashback
  // portals and dining delivery — see docs/source-expansion-strategy.md. Filter
  // only — this never changes review_state or imports/approves anything.
  "Credit cards",
  "Bank offers",
  "Velocity",
  "Flybuys",
  "Everyday Rewards",
  "ShopBack",
  "TopCashback",
  "Uber Eats",
  "DoorDash",
] as const;

/**
 * Display-only triage cue: many Costco (and some warehouse-club) items are
 * gated behind a paid membership, which changes how an admin treats the deal.
 * Surfacing it as a hint badge saves reading every title. Purely heuristic —
 * it never imports, rejects, or changes any review state.
 */
function mentionsMembership(item: FeedQueueItem): boolean {
  const haystack = `${item.rawTitle} ${item.rawSummary}`.toLowerCase();
  return haystack.includes("membership") || haystack.includes("members only");
}

const controlClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** How many items to render per "page" before "Show more". */
const PAGE_SIZE = 20;

/** Mirrors BULK_REVIEW_MAX in actions.ts (a "use server" module). */
const SELECT_ALL_CAP = 200;

/**
 * Per-item action row. Each action returns an AdminActionResult, so a returned
 * { error } (e.g. the rate-limit message) is shown inline below the buttons
 * instead of being thrown as a 500. Extracted into its own component so the
 * per-item error state is a valid hook (not called inside a map callback).
 */
function QueueItemActions({ item }: { item: FeedQueueItem }) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState({
    merchantId: item.metadata.merchantId ?? "",
    dealKind: item.metadata.dealKind,
    priceText: item.metadata.priceText ?? "",
    couponCode: item.metadata.couponCode ?? "",
    expiryDate: item.metadata.expiryDate ?? "",
    score: item.metadata.score == null ? "" : String(item.metadata.score),
  });
  const clear = () => setError(null);
  const approvalOverrides = (): FeedApprovalOverrides => ({
    merchantId: draft.merchantId.trim() || null,
    dealKind: draft.dealKind,
    priceText: draft.priceText.trim() || null,
    couponCode: draft.couponCode.trim() || null,
    expiryDate: draft.expiryDate || null,
    score: draft.score === "" ? null : Number(draft.score),
  });
  return (
    <CardFooter className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <ActionButton
          run={() => approveItem(item.id, approvalOverrides())}
          variant="default"
          title="Publish this reviewed deal now."
          onStart={clear}
          onError={setError}
          className="gap-1.5"
        >
          <Check className="size-3.5" />
          Approve
        </ActionButton>
        <ActionButton
          run={() => rejectItem(item.id)}
          onStart={clear}
          onError={setError}
          className="gap-1.5"
          confirm={`Reject "${item.rawTitle}"? The source row will be archived, not deleted.`}
        >
          <Trash2 className="size-3.5" />
          Reject
        </ActionButton>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setPreview((value) => !value)}
        >
          <Eye className="size-3.5" />
          {preview ? "Hide review fields" : "Review fields"}
        </Button>
        {/* Homepage Top 5 eligibility is independent of review state, so this
            never imports/approves and keeps the item in the queue. */}
        {item.hiddenFromHomepage ? (
          <ActionButton
            run={() => showInTopDeals(item.id)}
            className="gap-1.5"
            title="Make this item eligible for the homepage Top 5 if approved. This action does not publish it."
            onStart={clear}
            onError={setError}
          >
            <Eye className="size-3.5" />
            Show in Top 5
          </ActionButton>
        ) : (
          <ActionButton
            run={() => hideFromTopDeals(item.id)}
            className="gap-1.5"
            title="Prevent this item from appearing in the homepage Top 5 if approved. It stays in the review queue."
            onStart={clear}
            onError={setError}
          >
            <EyeOff className="size-3.5" />
            Hide from Top 5
          </ActionButton>
        )}
      </div>
      {preview ? (
        <div className="w-full space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{item.rawTitle}</p>
          <p className="mt-1 text-muted-foreground">
            {item.rawSummary || "No summary supplied by the feed."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-medium">
              Store id
              <Input
                value={draft.merchantId}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, merchantId: event.target.value }))
                }
                placeholder="optional-store-id"
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Deal kind
              <select
                value={draft.dealKind}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    dealKind: event.target.value as DealKind,
                  }))
                }
                className={cn(controlClass, "w-full")}
              >
                <option value="discount-code">Discount code</option>
                <option value="cashback">Cashback</option>
                <option value="gift-card">Gift card</option>
                <option value="points">Points</option>
                <option value="guide">Guide</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              Price
              <Input
                value={draft.priceText}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, priceText: event.target.value }))
                }
                placeholder="$199"
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Coupon
              <Input
                value={draft.couponCode}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, couponCode: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Expiry
              <Input
                type="date"
                value={draft.expiryDate}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, expiryDate: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Score
              <Input
                type="number"
                min="0"
                max="1000000"
                value={draft.score}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, score: event.target.value }))
                }
              />
            </label>
          </div>
        </div>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </CardFooter>
  );
}

export default function QueueClient({ items }: { items: FeedQueueItem[] }) {
  const [source, setSource] = useState("");
  const [brand, setBrand] = useState("");
  const [store, setStore] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [cashbackProvider, setCashbackProvider] = useState("");
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [presets, setPresets] = useState<string[]>([]);
  const [relevance, setRelevance] = useState<Relevance | "">("");
  const [sort, setSort] = useState<"newest" | "discount" | "expiry" | "score">(
    "newest"
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Distinct feed sources for the dropdown (id → label), preserving first-seen order.
  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (!seen.has(item.feedSourceId)) {
        seen.set(item.feedSourceId, item.feedSourceLabel ?? "Unknown feed");
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [items]);

  const stores = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.metadata.merchantId && item.metadata.merchantName) {
        seen.set(item.metadata.merchantId, item.metadata.merchantName);
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const brands = useMemo(() => feedQueueBrandOptions(items), [items]);
  const hasUnbrandedItems = useMemo(
    () => items.some((item) => item.metadata.brands.length === 0),
    [items]
  );

  // Assess once per data load (not per keystroke) — assessFeedItem runs dozens
  // of includes() scans per item, and `filtered` re-runs on every filter change.
  const relevanceById = useMemo(
    () => new Map(items.map((i) => [i.id, assessFeedItem(i)])),
    [items]
  );

  // Counts over the loaded items (NOT `filtered`) — stable context so the
  // chips stay usable as navigation instead of collapsing to 0 once clicked.
  const relevanceCounts = useMemo(() => {
    const counts: Record<Relevance, number> = { high: 0, medium: 0, low: 0 };
    for (const item of items) {
      counts[relevanceById.get(item.id)!.relevance]++;
    }
    return counts;
  }, [items, relevanceById]);

  const filtered = useMemo(() => {
    const matches = filterFeedQueueItems(
      items,
      {
        source,
        brand,
        store,
        query,
        category,
        cashbackProvider,
        expiringSoon,
        presets,
        relevance,
      },
      relevanceById
    );
    // Sort a copy — .sort() mutates, and sorting in place would break React's
    // referential-equality assumptions about `items`/the filtered result.
    return [...matches].sort((a, b) => {
      if (sort === "discount") {
        return (b.metadata.discountValue ?? -1) - (a.metadata.discountValue ?? -1);
      }
      if (sort === "expiry") {
        return (a.metadata.expiryDate ?? "9999-12-31").localeCompare(
          b.metadata.expiryDate ?? "9999-12-31"
        );
      }
      if (sort === "score") {
        return (b.metadata.score ?? -1) - (a.metadata.score ?? -1);
      }
      return b.fetchedAt.localeCompare(a.fetchedAt);
    });
  }, [
    items,
    source,
    brand,
    store,
    query,
    category,
    cashbackProvider,
    expiringSoon,
    presets,
    relevance,
    relevanceById,
    sort,
  ]);

  const anyFilterActive =
    source !== "" ||
    brand !== "" ||
    store !== "" ||
    query.trim() !== "" ||
    category.trim() !== "" ||
    cashbackProvider !== "" ||
    expiringSoon ||
    presets.length > 0 ||
    relevance !== "";

  // Reset pagination and selection whenever filters or the server-provided
  // queue snapshot change. This prevents a just-reviewed id remaining selected
  // after revalidation removes it from the visible queue.
  const viewKey = JSON.stringify([
    source,
    brand,
    store,
    query,
    category,
    cashbackProvider,
    expiringSoon,
    presets,
    relevance,
    sort,
    items.map((item) => item.id),
  ]);
  const [lastViewKey, setLastViewKey] = useState(viewKey);
  if (viewKey !== lastViewKey) {
    setLastViewKey(viewKey);
    setVisibleCount(PAGE_SIZE);
    setSelected(new Set());
  }

  // Pagination: render only the first `visibleCount` of the filtered list.
  const paged = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;
  const selectedCount = selected.size;

  function togglePreset(preset: string) {
    setPresets((prev) =>
      prev.includes(preset)
        ? prev.filter((p) => p !== preset)
        : [...prev, preset]
    );
  }

  function clearFilters() {
    setSource("");
    setBrand("");
    setStore("");
    setQuery("");
    setCategory("");
    setCashbackProvider("");
    setExpiringSoon(false);
    setPresets([]);
    setRelevance("");
  }

  function toggleRelevance(level: Relevance) {
    setRelevance((prev) => (prev === level ? "" : level));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Add every currently-shown (paged) item to the selection. */
  function selectAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of feedQueueSelectionIds(paged, SELECT_ALL_CAP)) next.add(id);
      return next;
    });
  }

  /**
   * Add every filtered item (not just the current page) to the selection, up
   * to SELECT_ALL_CAP. Mirrors BULK_IGNORE_MAX in actions.ts — capping here
   * matches what the server would silently slice to, so the count shown and
   * the count applied never diverge.
   */
  function selectAllFiltered() {
    setSelected(new Set(feedQueueSelectionIds(filtered, SELECT_ALL_CAP)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // Bulk actions act ONLY on the explicitly-selected ids, behind a confirm.
  // On a typed failure ({ error }) the selection is kept so the admin can
  // retry; on success it clears.
  function runBulk(
    ids: string[],
    run: (ids: string[]) => Promise<{ ok: true } | { error: string }>
  ) {
    setBulkError(null);
    startTransition(async () => {
      const result = await run(ids);
      if ("error" in result) {
        setBulkError(result.error);
        return;
      }
      setSelected(new Set());
    });
  }

  function handleRejectSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Reject ${ids.length} selected item${ids.length === 1 ? "" : "s"}?\n\n` +
        "They will be archived and removed from this queue. Source history is preserved."
    );
    if (!ok) return;
    runBulk(ids, rejectSelectedItems);
  }

  function handleApproveSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Approve and publish ${ids.length} selected deal${ids.length === 1 ? "" : "s"}?\n\n` +
        "This is the human publication step. Each selected deal becomes public immediately."
    );
    if (!ok) return;
    runBulk(ids, approveSelectedItems);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or summary…"
              className="pl-8"
              aria-label="Search title or summary"
            />
          </div>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category / tag…"
            className="w-full sm:max-w-[12rem]"
            aria-label="Filter by category or tag"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Filter by feed source"
            className={controlClass}
          >
            <option value="">All feeds</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            aria-label="Filter by brand"
            className={cn(controlClass, "w-full max-w-full sm:w-auto")}
          >
            <option value="">All brands</option>
            {brands.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {hasUnbrandedItems ? (
              <option value={NO_BRAND_FILTER}>Unknown / no brand</option>
            ) : null}
          </select>
          <select
            value={store}
            onChange={(e) => setStore(e.target.value)}
            aria-label="Filter by store"
            className={controlClass}
          >
            <option value="">All stores</option>
            {stores.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <select
            value={cashbackProvider}
            onChange={(e) => setCashbackProvider(e.target.value)}
            aria-label="Filter by cashback provider"
            className={controlClass}
          >
            <option value="">All cashback providers</option>
            <option value="ShopBack">ShopBack</option>
            <option value="TopCashback">TopCashback</option>
          </select>
          <select
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as "newest" | "discount" | "expiry" | "score")
            }
            aria-label="Sort order"
            className={controlClass}
          >
            <option value="newest">Newest first</option>
            <option value="discount">Highest discount</option>
            <option value="expiry">Expiry soonest</option>
            <option value="score">Highest score</option>
          </select>
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm">
            <input
              type="checkbox"
              checked={expiringSoon}
              onChange={(event) => setExpiringSoon(event.target.checked)}
              className="size-4 accent-primary"
            />
            Expiring soon
          </label>
          <span className="text-xs text-muted-foreground sm:ml-auto">
            Showing{" "}
            <span className="font-medium text-foreground tabular-nums">
              {paged.length}
            </span>{" "}
            of <span className="tabular-nums">{filtered.length}</span>
            {filtered.length !== items.length ? (
              <> (filtered from <span className="tabular-nums">{items.length}</span>)</>
            ) : null}
          </span>
        </div>

        {/* Keyword presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => {
            const on = presets.includes(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => togglePreset(preset)}
                aria-pressed={on}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                {preset}
              </button>
            );
          })}
          {anyFilterActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3" />
              Clear
            </button>
          ) : null}
        </div>

        {/* Relevance chips — the triage axis: filter the loaded queue by the
            existing heuristic hint, with live counts over ALL loaded items. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["high", "medium", "low"] as const).map((level) => {
            const on = relevance === level;
            const meta = RELEVANCE_META[level];
            const label = level[0].toUpperCase() + level.slice(1);
            return (
              <button
                key={level}
                type="button"
                onClick={() => toggleRelevance(level)}
                aria-pressed={on}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : cn("border-border bg-background", meta.className)
                )}
              >
                {label} ({relevanceCounts[level]})
              </button>
            );
          })}
        </div>

        {/* Selection-based bulk actions — act only on explicitly ticked items. */}
        {filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium tabular-nums",
                  selectedCount > 0
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                )}
              >
                {selectedCount} selected
              </span>
              <button
                type="button"
                onClick={selectAllShown}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Select all shown ({paged.length})
              </button>
              <button
                type="button"
                onClick={selectAllFiltered}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Select all filtered ({Math.min(filtered.length, SELECT_ALL_CAP)})
              </button>
              {selectedCount > 0 ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  <X className="size-3" />
                  Clear selection
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleApproveSelected}
                disabled={selectedCount === 0 || isPending}
                title="Publish all selected, reviewed deals."
                className="gap-1.5"
              >
                <Check className="size-3.5" />
                {isPending
                  ? "Working…"
                  : `Approve selected${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRejectSelected}
                disabled={selectedCount === 0 || isPending}
                className="gap-1.5"
              >
                <Trash2 className="size-3.5" />
                {isPending
                  ? "Working…"
                  : `Reject selected${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
              </Button>
            </div>
            {bulkError ? (
              <p role="alert" className="basis-full text-xs text-destructive">
                {bulkError}
              </p>
            ) : null}
            {filtered.length > SELECT_ALL_CAP ? (
              <p className="basis-full text-xs text-muted-foreground">
                Bulk actions are capped at {SELECT_ALL_CAP} items per pass —
                review this batch, then refresh to load more.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No staged items match these filters.{" "}
          <button
            type="button"
            onClick={clearFilters}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </p>
      ) : (
        <div className="space-y-4">
          {paged.map((item) => {
            const host = safeHost(item.link);
            const sourceHref = safeHttpsUrl(item.link);
            const thumbnailHref = item.thumbnailUrl
              ? safeHttpsUrl(item.thumbnailUrl)
              : null;
            const metadata = item.metadata;
            const { suggestedMerchant, relevance: itemRelevance } =
              relevanceById.get(item.id)!;
            const rel = RELEVANCE_META[itemRelevance];
            const isSelected = selected.has(item.id);
            return (
              <Card
                key={item.id}
                className={cn(
                  "flex flex-col",
                  isSelected && "ring-2 ring-primary/40"
                )}
              >
                <CardHeader className="gap-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      aria-label={`Select for bulk actions: ${item.rawTitle}`}
                      className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                      {thumbnailHref ? (
                        // Feed thumbnails are admin-only, lazy, HTTPS-validated,
                        // and sent without a referrer. They are never fetched server-side.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnailHref}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Rss className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                    {/* Review-assist hints (heuristic; never auto-import/reject). */}
                    <Badge
                      variant="outline"
                      className={cn("gap-1", rel.className)}
                      title="Heuristic relevance hint — review assistance only."
                    >
                      <Gauge className="size-3" />
                      {rel.label}
                    </Badge>
                    {metadata.merchantName ?? suggestedMerchant ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                        title="Suggested store match auto-detected from the title."
                      >
                        <StoreIcon className="size-3" />
                        {metadata.merchantName ?? suggestedMerchant}
                      </Badge>
                    ) : null}
                    {mentionsMembership(item) ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-400"
                        title="The feed text mentions a paid membership (e.g. Costco) — display-only hint; it never imports or rejects."
                      >
                        <CreditCard className="size-3" />
                        Membership required
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="gap-1">
                      <Rss className="size-3" />
                      {item.feedSourceLabel ?? "Unknown feed"}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {item.reviewState}
                    </Badge>
                    {item.hiddenFromHomepage ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-muted-foreground/40 text-muted-foreground"
                        title="Excluded from the public homepage Top 5 even if it is approved."
                      >
                        <EyeOff className="size-3" />
                        Hidden from Top 5
                      </Badge>
                    ) : null}
                    {item.existingSignal ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400"
                      >
                        <AlertTriangle className="size-3" />
                        Already imported ({item.existingSignal.status})
                      </Badge>
                    ) : null}
                    {item.categories.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                    {metadata.discountText ? (
                      <Badge variant="secondary">{metadata.discountText}</Badge>
                    ) : null}
                    {metadata.cashbackText ? (
                      <Badge variant="secondary">
                        {metadata.cashbackProvider
                          ? `${metadata.cashbackText} via ${metadata.cashbackProvider}`
                          : metadata.cashbackText}
                      </Badge>
                    ) : null}
                    {metadata.couponCode ? (
                      <Badge variant="outline" className="gap-1">
                        <Ticket className="size-3" />
                        {metadata.couponCode}
                      </Badge>
                    ) : null}
                      </div>
                      <CardTitle className="text-base leading-snug">
                        {item.rawTitle}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {item.rawSummary || (
                      <span className="italic">
                        No summary in the feed item.
                      </span>
                    )}
                  </p>
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <span>
                      Price: {metadata.priceText ?? "Not supplied"} · Expiry:{" "}
                      {metadata.expiryDate ?? "Not supplied"} · Score:{" "}
                      {metadata.score ?? "Not supplied"}
                    </span>
                    {/* Safer link: surface the destination host, show the full URL
                        as plain text, nofollow + noopener, never auto-opened. */}
                    <span className="inline-flex items-center gap-1">
                      <ExternalLink className="size-3 shrink-0" />
                      Source host:{" "}
                      <span className="font-medium text-foreground">
                        {host ?? "unknown / unparseable"}
                      </span>
                    </span>
                    {sourceHref ? (
                      <a
                        href={sourceHref}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="w-fit break-all underline-offset-2 hover:underline"
                      >
                        Open original OzBargain post
                      </a>
                    ) : (
                      <span className="break-all">Unsafe source URL hidden</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      Posted {formatDate(item.postedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="size-3" />
                      Fetched {formatDate(item.fetchedAt)}
                    </span>
                    <span className="break-all font-mono">
                      native id: {item.sourceNativeId}
                    </span>
                    <span className="font-mono">
                      hash:{" "}
                      {item.contentHash
                        ? `${item.contentHash.slice(0, 12)}…`
                        : "—"}
                    </span>
                    {item.existingSignal ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        Importing will link to existing signal{" "}
                        <span className="font-mono">
                          {item.existingSignal.id}
                        </span>{" "}
                        (status: {item.existingSignal.status}) instead of creating
                        a new one.
                      </span>
                    ) : null}
                  </div>
                </CardContent>

                <QueueItemActions item={item} />
              </Card>
            );
          })}

          {/* Pagination: incremental reveal; reset to one page when filters change. */}
          {filtered.length > PAGE_SIZE ? (
            <div className="flex items-center justify-center gap-2 pt-1">
              {hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                >
                  Show more ({filtered.length - paged.length} more)
                </Button>
              ) : null}
              {visibleCount > PAGE_SIZE ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount(PAGE_SIZE)}
                >
                  Show less
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
