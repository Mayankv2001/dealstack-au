"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  RefreshCw,
  Rss,
  Search,
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
import type { FeedQueueItem } from "@/lib/admin/repos/feedQueue";
import { cn } from "@/lib/utils";
import {
  ignoreItem,
  ignoreVisibleItems,
  importItem,
  markDuplicate,
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

export default function QueueClient({ items }: { items: FeedQueueItem[] }) {
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
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

  // Bulk ignore is scoped to the CURRENTLY VISIBLE filtered items, gated behind an
  // active filter + an explicit confirm, so it can never sweep the whole queue.
  function handleBulkIgnore() {
    const ids = filtered.map((i) => i.id);
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Ignore ${ids.length} visible item${ids.length === 1 ? "" : "s"}? ` +
        "They'll be moved out of the queue (review_state = ignored). " +
        "This does not delete anything and nothing is published."
    );
    if (!ok) return;
    startTransition(async () => {
      await ignoreVisibleItems(ids);
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
              {filtered.length}
            </span>{" "}
            of{" "}
            <span className="tabular-nums">{items.length}</span>
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

        {/* Scoped bulk action — only when a filter is active and items are visible. */}
        {anyFilterActive && filtered.length > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t pt-2.5">
            <span className="text-xs text-muted-foreground">
              Bulk action applies only to the {filtered.length} item
              {filtered.length === 1 ? "" : "s"} shown above.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBulkIgnore}
              disabled={isPending}
            >
              {isPending
                ? "Ignoring…"
                : `Ignore ${filtered.length} visible`}
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
          {filtered.map((item) => {
            const host = safeHost(item.link);
            return (
              <Card key={item.id} className="flex flex-col">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="gap-1">
                      <Rss className="size-3" />
                      {item.feedSourceLabel ?? "Unknown feed"}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {item.reviewState}
                    </Badge>
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
                    <Button type="submit" size="sm">
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
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
