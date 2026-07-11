"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
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
import type { FeedQueueItem } from "@/lib/admin/repos/feedQueue";
import { assessFeedItem, type Relevance } from "@/lib/admin/queueRelevance";
import { cn } from "@/lib/utils";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import {
  hideFromTopDeals,
  ignoreItem,
  ignoreVisibleItems,
  importItem,
  importSelectedItems,
  markDuplicate,
  showInTopDeals,
} from "./actions";

/**
 * Client review island for the feed import queue.
 *
 * The server page owns the (service-role) data fetch and passes the staged items
 * in. This component adds in-memory search/filtering and selection-scoped bulk
 * actions (import-as-pending / ignore) — it fetches nothing and changes no
 * triage logic. The per-item Import / Ignore / Mark duplicate actions are the
 * EXISTING server actions (bound per item); the bulk buttons send only the
 * explicitly ticked ids, so "select all filtered, untick the exceptions" is the
 * intended workflow. Bulk import never publishes: every import lands as a
 * PENDING signal that still needs approval in /admin/signals.
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

/** Mirrors BULK_IGNORE_MAX in actions.ts (a "use server" module — not importable here). */
const SELECT_ALL_CAP = 200;

/**
 * Per-item action row. Each action returns an AdminActionResult, so a returned
 * { error } (e.g. the rate-limit message) is shown inline below the buttons
 * instead of being thrown as a 500. Extracted into its own component so the
 * per-item error state is a valid hook (not called inside a map callback).
 */
function QueueItemActions({ item }: { item: FeedQueueItem }) {
  const [error, setError] = useState<string | null>(null);
  const clear = () => setError(null);
  return (
    <CardFooter className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <ActionButton
          run={() => importItem(item.id)}
          variant="default"
          title="Creates a pending signal in /admin/signals. It is NOT public until you approve it there."
          onStart={clear}
          onError={setError}
        >
          Import as pending signal
        </ActionButton>
        <ActionButton run={() => ignoreItem(item.id)} onStart={clear} onError={setError}>
          Ignore
        </ActionButton>
        <ActionButton
          run={() => markDuplicate(item.id)}
          onStart={clear}
          onError={setError}
        >
          Mark duplicate
        </ActionButton>
        {/* Homepage Top 5 eligibility is independent of review state, so this
            never imports/approves and keeps the item in the queue. */}
        {item.hiddenFromHomepage ? (
          <ActionButton
            run={() => showInTopDeals(item.id)}
            className="gap-1.5"
            title="Make this item eligible for the homepage Top 5 after it is imported and its linked signal is approved. This action does not import, approve or publish it."
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
            title="Prevent this item from appearing in the homepage Top 5 even after import and signal approval. It stays in the queue and can still be imported or ignored."
            onStart={clear}
            onError={setError}
          >
            <EyeOff className="size-3.5" />
            Hide from Top 5
          </ActionButton>
        )}
      </div>
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
  const [relevance, setRelevance] = useState<Relevance | "">("");
  const [oldestFirst, setOldestFirst] = useState(false);
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
    const q = query.trim().toLowerCase();
    const cat = category.trim().toLowerCase();
    const activePresets = presets.map((p) => p.toLowerCase());
    const matches = items.filter((item) => {
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
      if (relevance && relevanceById.get(item.id)?.relevance !== relevance) {
        return false;
      }
      return true;
    });
    // Sort a copy — .sort() mutates, and sorting in place would break React's
    // referential-equality assumptions about `items`/the filtered result.
    return [...matches].sort((a, b) =>
      oldestFirst
        ? a.fetchedAt.localeCompare(b.fetchedAt)
        : b.fetchedAt.localeCompare(a.fetchedAt)
    );
  }, [items, source, query, category, presets, relevance, relevanceById, oldestFirst]);

  const anyFilterActive =
    source !== "" ||
    query.trim() !== "" ||
    category.trim() !== "" ||
    presets.length > 0 ||
    relevance !== "";

  // Reset pagination AND selection whenever the active filter set changes, using
  // React's render-phase reset pattern (a setState in an effect is discouraged).
  // Resetting selection keeps "Ignore selected" scoped to the current view.
  const filterKey = `${source} ${query} ${category} ${presets.join(" ")} ${relevance} ${oldestFirst}`;
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
      for (const item of paged) next.add(item.id);
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
    setSelected(new Set(filtered.slice(0, SELECT_ALL_CAP).map((i) => i.id)));
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

  // Bulk ignore: reuses the existing ignoreVisibleItems action (ignored
  // review_state only — never imports, approves, or publishes).
  function handleIgnoreSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Ignore ${ids.length} selected item${ids.length === 1 ? "" : "s"}?\n\n` +
        "They will be marked as ignored and removed from this queue view. " +
        "Nothing is deleted and nothing is published — recovering an ignored item " +
        "requires a database operation, not a filter here."
    );
    if (!ok) return;
    runBulk(ids, ignoreVisibleItems);
  }

  // Bulk import: same promotion as the per-item button — every item becomes a
  // PENDING signal (or links to an existing one) and still needs the second
  // manual approval step in /admin/signals before anything is public.
  function handleImportSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Import ${ids.length} selected item${ids.length === 1 ? "" : "s"} as pending signals?\n\n` +
        "Nothing goes public: each import creates (or links to) a PENDING signal " +
        "that still needs your approval in Signals before it appears anywhere."
    );
    if (!ok) return;
    runBulk(ids, importSelectedItems);
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
            value={oldestFirst ? "oldest" : "newest"}
            onChange={(e) => setOldestFirst(e.target.value === "oldest")}
            aria-label="Sort order"
            className={controlClass}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
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
                onClick={handleImportSelected}
                disabled={selectedCount === 0 || isPending}
                title="Creates PENDING signals — nothing is public until each one is approved in Signals."
              >
                {isPending
                  ? "Working…"
                  : `Import selected as pending${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleIgnoreSelected}
                disabled={selectedCount === 0 || isPending}
              >
                {isPending
                  ? "Working…"
                  : `Ignore selected${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
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
                ignore this batch, then refresh to load more.
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
                        title="Excluded from the public homepage Top 5 even if its linked signal is later approved. Still in the queue and importable."
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
                    {sourceHref ? (
                      <a
                        href={sourceHref}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="w-fit break-all underline-offset-2 hover:underline"
                      >
                        {item.link}
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
