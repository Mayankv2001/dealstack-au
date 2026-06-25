"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  Gauge,
  RefreshCw,
  Rss,
  Search,
  Store as StoreIcon,
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
import { stores } from "@/lib/data";
import type { FeedQueueItem } from "@/lib/admin/repos/feedQueue";
import { findMerchantIdInText } from "@/lib/sources/normalise";
import { cn } from "@/lib/utils";
import {
  hideFromTopDeals,
  ignoreItem,
  ignoreVisibleItems,
  importItem,
  markDuplicate,
  showInTopDeals,
} from "./actions";

/**
 * Client review island for the feed import queue.
 *
 * The server page owns the (service-role) data fetch and passes the staged items
 * in. This component adds in-memory search/filtering and a scoped bulk-ignore —
 * it fetches nothing and changes no triage logic. The Import / Ignore / Mark
 * duplicate actions are the EXISTING server actions (bound per item); bulk ignore
 * calls `ignoreVisibleItems` with only the currently-visible filtered ids.
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
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// ── Review-assist heuristics (display only — never auto-import or reject) ──────

const STORE_NAME_BY_ID = new Map(stores.map((s) => [s.id, s.name]));

/** High-value cues: our core deal types + the points programmes we track. */
const HIGH_RELEVANCE_KEYWORDS = [
  "gift card",
  "giftcard",
  "cashback",
  "cash back",
  "points",
  "qantas",
  "velocity",
  "flybuys",
  "everyday rewards",
  "frequent flyer",
];

/** Generic retail/deal cues: relevant category, but not a tracked store/type. */
const MEDIUM_RELEVANCE_KEYWORDS = [
  "discount",
  "deal",
  "sale",
  "clearance",
  "coupon",
  "promo",
  "voucher",
  "bonus",
  "% off",
  "percent off",
  "bundle",
  "catalogue",
  "price drop",
  "rrp",
];

type Relevance = "high" | "medium" | "low";

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

/**
 * A heuristic, read-only review hint for one staged item:
 *   - suggestedMerchant: the tracked store auto-detected in the TITLE (mirrors
 *     what the import action would set), via the existing normalise helper;
 *   - relevance: High when a tracked store is mentioned anywhere or a core
 *     keyword (gift card / cashback / points / Qantas / Velocity …) is present;
 *     Medium for generic retail/deal cues; Low otherwise.
 * It NEVER imports, rejects, or changes any state — it only helps the admin
 * decide faster.
 */
function assessItem(item: FeedQueueItem): {
  suggestedMerchant: string | null;
  relevance: Relevance;
} {
  const haystack =
    `${item.rawTitle} ${item.rawSummary} ${item.categories.join(" ")}`.toLowerCase();
  // Title-only match mirrors the import action's auto-suggested merchant.
  const titleMerchantId = findMerchantIdInText(item.rawTitle);
  const suggestedMerchant = titleMerchantId
    ? STORE_NAME_BY_ID.get(titleMerchantId) ?? null
    : null;
  // Relevance considers the whole item (a tracked store mentioned anywhere counts).
  const mentionsTrackedStore = findMerchantIdInText(haystack) != null;

  let relevance: Relevance;
  if (mentionsTrackedStore || HIGH_RELEVANCE_KEYWORDS.some((k) => haystack.includes(k))) {
    relevance = "high";
  } else if (MEDIUM_RELEVANCE_KEYWORDS.some((k) => haystack.includes(k))) {
    relevance = "medium";
  } else {
    relevance = "low";
  }
  return { suggestedMerchant, relevance };
}

/** Quick keyword presets for the merchants / deal types we care about. */
const PRESETS = [
  "Qantas",
  "JB Hi-Fi",
  "Amazon",
  "Coles",
  "Woolworths",
  "Officeworks",
  "The Good Guys",
  "gift card",
  "cashback",
  "points",
] as const;

const controlClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** How many items to render per "page" before "Show more". */
const PAGE_SIZE = 20;

export default function QueueClient({ items }: { items: FeedQueueItem[] }) {
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cat = category.trim().toLowerCase();
    const activePresets = presets.map((p) => p.toLowerCase());
    return items.filter((item) => {
      if (source && item.feedSourceId !== source) return false;
      if (q && !`${item.rawTitle} ${item.rawSummary}`.toLowerCase().includes(q)) {
        return false;
      }
      if (
        cat &&
        !item.categories.some((c) => c.toLowerCase().includes(cat))
      ) {
        return false;
      }
      if (activePresets.length > 0) {
        const haystack =
          `${item.rawTitle} ${item.rawSummary} ${item.categories.join(" ")}`.toLowerCase();
        if (!activePresets.some((p) => haystack.includes(p))) return false;
      }
      return true;
    });
  }, [items, source, query, category, presets]);

  const anyFilterActive =
    source !== "" ||
    query.trim() !== "" ||
    category.trim() !== "" ||
    presets.length > 0;

  // Reset pagination AND selection whenever the active filter set changes, using
  // React's render-phase reset pattern (a setState in an effect is discouraged).
  // Resetting selection keeps "Ignore selected" scoped to the current view.
  const filterKey = `${source} ${query} ${category} ${presets.join(" ")}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
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
    setQuery("");
    setCategory("");
    setPresets([]);
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
      for (const item of paged) next.add(item.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // Safer bulk ignore: acts ONLY on the explicitly-selected ids, behind a
  // confirm. Reuses the existing ignoreVisibleItems action (ignored review_state
  // only — never imports, approves, or publishes). Selection clears on success.
  function handleIgnoreSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Dismiss ${ids.length} selected item${ids.length === 1 ? "" : "s"}?\n\n` +
        "They will be marked as ignored and removed from this queue view. " +
        "Nothing is deleted and nothing is published. " +
        "Ignored items can be found by changing the review_state filter if you need them again."
    );
    if (!ok) return;
    startTransition(async () => {
      await ignoreVisibleItems(ids);
      setSelected(new Set());
    });
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

        {/* Selection-based bulk ignore — acts only on explicitly ticked items. */}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleIgnoreSelected}
              disabled={selectedCount === 0 || isPending}
            >
              {isPending
                ? "Ignoring…"
                : `Ignore selected${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
            </Button>
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
            const { suggestedMerchant, relevance } = assessItem(item);
            const rel = RELEVANCE_META[relevance];
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
                      aria-label={`Select for bulk ignore: ${item.rawTitle}`}
                      className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                    {/* Review-assist hints (heuristic; never auto-import/reject). */}
                    <Badge
                      variant="outline"
                      className={cn("gap-1", rel.className)}
                      title="Heuristic relevance hint — review assistance only; it never imports or rejects."
                    >
                      <Gauge className="size-3" />
                      {rel.label}
                    </Badge>
                    {suggestedMerchant ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                        title="Suggested store match (auto-detected from the title) — confirm on import."
                      >
                        <StoreIcon className="size-3" />
                        {suggestedMerchant}
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
                        title="Excluded from the public homepage Top 5. Still in the queue and importable."
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
                    {/* Safer link: surface the destination host, show the full URL
                        as plain text, nofollow + noopener, never auto-opened. */}
                    <span className="inline-flex items-center gap-1">
                      <ExternalLink className="size-3 shrink-0" />
                      Source host:{" "}
                      <span className="font-medium text-foreground">
                        {host ?? "unknown / unparseable"}
                      </span>
                    </span>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="w-fit break-all underline-offset-2 hover:underline"
                    >
                      {item.link}
                    </a>
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

                <CardFooter className="flex flex-wrap gap-2">
                  {/* POST forms so each bound server action runs on the server. */}
                  <form action={importItem.bind(null, item.id)}>
                    <Button
                      type="submit"
                      size="sm"
                      title="Creates a pending signal in /admin/signals. It is NOT public until you approve it there."
                    >
                      Import as pending signal
                    </Button>
                  </form>
                  <form action={ignoreItem.bind(null, item.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      Ignore
                    </Button>
                  </form>
                  <form action={markDuplicate.bind(null, item.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      Mark duplicate
                    </Button>
                  </form>
                  {/* Homepage Top 5 visibility — independent of review state, so
                      this never imports/ignores and keeps the item in the queue. */}
                  {item.hiddenFromHomepage ? (
                    <form action={showInTopDeals.bind(null, item.id)}>
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        title="Allow this item to appear in the homepage 'Today's top OzBargain signals' section. Does not import or publish — it must still be imported first."
                      >
                        <Eye className="size-3.5" />
                        Show in Top 5
                      </Button>
                    </form>
                  ) : (
                    <form action={hideFromTopDeals.bind(null, item.id)}>
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        title="Prevent this item from appearing in the homepage 'Today's top OzBargain signals' section. Stays in the queue and can still be imported or ignored."
                      >
                        <EyeOff className="size-3.5" />
                        Hide from Top 5
                      </Button>
                    </form>
                  )}
                </CardFooter>
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
