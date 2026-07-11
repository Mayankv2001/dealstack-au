import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CalendarClock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  DQ_FLAG_LIMIT,
  type DataQualityCounts,
  type DataQualityIssueCode,
  getDashboardCounts,
  getDataQualityReport,
  getRecentUpdates,
} from "@/lib/admin/repos/dashboard";
import { countNewFeedItems } from "@/lib/admin/repos/feedQueue";
import {
  isApprovedForFetch,
  listFeedSources,
} from "@/lib/admin/repos/feedSources";
import { getMonitorStatus } from "@/lib/admin/repos/monitorStatus";
import { recheckTableFor } from "@/lib/admin/repos/recheck";
import { isMonitorStale, MONITOR_STALE_HOURS } from "@/lib/monitor/staleness";
import { formatDateAU } from "@/lib/sources/normalise";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/admin/ActionButton";
import { markRechecked } from "./actions";

export const metadata: Metadata = {
  title: "Admin dashboard | DealStack AU",
};

interface Stat {
  label: string;
  value: number;
}

interface Section {
  title: string;
  description: string;
  href: string;
  total: number;
  stats: Stat[];
}

// Deterministic, AU-local timestamp for the recent-updates feed. Fixed parts +
// timeZone keep server-rendered output stable — the page is a server component
// (its only client island is the "Mark re-checked" ActionButton).
const RECENT_DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

/**
 * Plain-English meaning of each data-quality check — used for both the summary
 * tiles and the per-item issue chips. Mirrors the checks in
 * getDataQualityReport(); display only, no logic.
 */
const DQ_ISSUE_INFO: Record<
  DataQualityIssueCode,
  { label: string; explanation: string; tone: string }
> = {
  "unsafe-url": {
    label: "Unsafe URL",
    explanation:
      "A public link, logo path or monitor feed target violates the HTTPS/host policy and is blocked until repaired.",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  "placeholder-copy": {
    label: "Placeholder copy",
    explanation:
      "Published row still contains demo/illustrative wording — replace it with verified real offer details before relying on it.",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  expired: {
    label: "Expired but still live",
    explanation:
      "Expiry date has passed, yet the row is still published/approved — unpublish or refresh it.",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  "missing-source": {
    label: "Missing source URL",
    explanation:
      "Published offer with no cited source link, so its terms can't be verified.",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  stale: {
    label: "Not re-checked 30+ days",
    explanation:
      "Hasn't been re-checked in over 30 days and may be out of date.",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  "review-overdue": {
    label: "Review deadline passed",
    explanation:
      "A published offer passed its mandatory review-by date and is hidden publicly until it is verified again.",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  "missing-expiry": {
    label: "Missing expiry date",
    explanation:
      "Published offer with no expiry date, so it can never be auto-flagged as expired.",
    tone: "border-muted-foreground/30 bg-muted text-muted-foreground",
  },
  "stale-week-of": {
    label: "Stale weekly deal",
    explanation:
      "Published weekly deal whose weekOf is from a prior week — update or unpublish it.",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
};

/** Tile order + the count each maps to (typed accessor, no string lookups). */
const DQ_TILE_ORDER: {
  code: DataQualityIssueCode;
  count: (c: DataQualityCounts) => number;
}[] = [
  { code: "unsafe-url", count: (c) => c.unsafeUrl },
  { code: "placeholder-copy", count: (c) => c.placeholderCopy },
  { code: "expired", count: (c) => c.expiredPublished },
  { code: "missing-source", count: (c) => c.missingSourceUrl },
  { code: "missing-expiry", count: (c) => c.missingExpiry },
  { code: "stale", count: (c) => c.staleChecked },
  { code: "review-overdue", count: (c) => c.reviewOverdue },
  { code: "stale-week-of", count: (c) => c.staleWeekOf },
];

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dq?: string }>;
}) {
  // Belt-and-suspenders: the protected layout already gates, but every admin
  // page verifies independently (proxy is only an optimistic check).
  const { email } = await requireAdmin();
  const { dq } = await searchParams;
  const [counts, recent, feedQueueCount, dataQuality, feedSources, monitor] =
    await Promise.all([
      getDashboardCounts(),
      getRecentUpdates(5),
      countNewFeedItems(),
      getDataQualityReport(),
      listFeedSources(),
      getMonitorStatus(),
    ]);

  // Monitor health for the Needs-attention list. Staleness only counts when we
  // EXPECT fetches: at least one enabled fetch-approved feed AND the env master
  // switch is on — a deliberately disabled monitor is not an incident.
  const fetchableEnabledFeedCount = feedSources.filter(
    (s) => s.isEnabled && isApprovedForFetch(s.sourceType)
  ).length;
  const enabledUnfetchableCount = feedSources.filter(
    (s) => s.isEnabled && !isApprovedForFetch(s.sourceType)
  ).length;
  const monitorStale =
    monitor.envEnabled &&
    isMonitorStale({
      fetchableEnabledFeedCount,
      lastSuccessAt: monitor.lastSuccessLog?.startedAt ?? null,
      now: new Date(),
    });

  // "Show all" via URL query param — server-driven, so no client state needed
  // (the page's only client island is the "Mark re-checked" ActionButton).
  const showAllFlags = dq === "all";
  const displayedFlags = showAllFlags
    ? dataQuality.flags
    : dataQuality.flags.slice(0, DQ_FLAG_LIMIT);

  const sections: Section[] = [
    {
      title: "Stores",
      description: "Merchant records powering store pages, the grid and stacks.",
      href: "/admin/stores",
      total: counts.stores.total,
      stats: [
        { label: "Published", value: counts.stores.published },
        { label: "Unpublished", value: counts.stores.unpublished },
      ],
    },
    {
      title: "Cashback",
      description: "ShopBack & TopCashback offers (no Cashrewards).",
      href: "/admin/cashback",
      total: counts.cashback.total,
      stats: [
        { label: "Published", value: counts.cashback.published },
        { label: "Draft", value: counts.cashback.unpublished },
      ],
    },
    {
      title: "Gift Cards",
      description: "Discounted gift-card offers and where they're accepted.",
      href: "/admin/gift-cards",
      total: counts.giftCards.total,
      stats: [
        { label: "Published", value: counts.giftCards.published },
        { label: "Draft", value: counts.giftCards.unpublished },
      ],
    },
    {
      title: "Card Offers",
      description: "Bank & credit-card sign-up offers shown on /cards.",
      href: "/admin/card-offers",
      total: counts.cardOffers.total,
      stats: [
        { label: "Published", value: counts.cardOffers.published },
        { label: "Draft", value: counts.cardOffers.unpublished },
      ],
    },
    {
      title: "Points",
      description: "Points programs and earn-rate boosts.",
      href: "/admin/points",
      total: counts.points.total,
      stats: [
        { label: "Published", value: counts.points.published },
        { label: "Draft", value: counts.points.unpublished },
      ],
    },
    {
      title: "OzBargain Signals",
      description: "Manually curated community deal signals.",
      href: "/admin/signals",
      total: counts.signals.total,
      stats: [
        { label: "Approved", value: counts.signals.approved },
        { label: "Pending", value: counts.signals.pending },
      ],
    },
    {
      title: "Weekly Deals",
      description: "Curated editorial cards referencing existing offer ids.",
      href: "/admin/weekly-deals",
      total: counts.weeklyDeals.total,
      stats: [
        { label: "Published", value: counts.weeklyDeals.published },
        { label: "Draft", value: counts.weeklyDeals.unpublished },
      ],
    },
  ];

  // Derived entirely from the counts above — drafts waiting to publish plus
  // signals still pending review. Each links to its section list.
  const attention = [
    {
      label: "Feed items to review",
      value: feedQueueCount,
      href: "/admin/signals/queue",
    },
    {
      label: "Pending OzBargain signals",
      value: counts.signals.pending,
      href: "/admin/signals",
    },
    {
      label: "Unpublished stores",
      value: counts.stores.unpublished,
      href: "/admin/stores",
    },
    {
      label: "Unpublished cashback offers",
      value: counts.cashback.unpublished,
      href: "/admin/cashback",
    },
    {
      label: "Unpublished gift card offers",
      value: counts.giftCards.unpublished,
      href: "/admin/gift-cards",
    },
    {
      label: "Unpublished card offers",
      value: counts.cardOffers.unpublished,
      href: "/admin/card-offers",
    },
    {
      label: "Unpublished points offers",
      value: counts.points.unpublished,
      href: "/admin/points",
    },
    {
      label: "Unpublished weekly deals",
      value: counts.weeklyDeals.unpublished,
      href: "/admin/weekly-deals",
    },
    {
      label: `Feed monitor: no successful run in ${MONITOR_STALE_HOURS}h+`,
      value: monitorStale ? 1 : 0,
      href: "/admin/monitor",
    },
    {
      label: "Enabled feeds the monitor cannot fetch",
      value: enabledUnfetchableCount,
      href: "/admin/signals/sources",
    },
  ];
  const attentionTotal = attention.reduce((sum, a) => sum + a.value, 0);

  // Read-only data-quality metrics over published offers + approved signals.
  // Derived from DQ_TILE_ORDER so the tile labels/explanations stay in sync
  // with the per-item issue chips.
  const dataQualityMetrics = DQ_TILE_ORDER.map(({ code, count }) => ({
    code,
    label: DQ_ISSUE_INFO[code].label,
    explanation: DQ_ISSUE_INFO[code].explanation,
    value: count(dataQuality.counts),
  }));

  const quickActions = [
    { label: "Monitor Status", href: "/admin/monitor" },
    { label: "Review Feed Queue", href: "/admin/signals/queue" },
    { label: "Add Store", href: "/admin/stores/new" },
    { label: "Add Cashback Rate", href: "/admin/cashback/new" },
    { label: "Add Gift Card Offer", href: "/admin/gift-cards/new" },
    { label: "Add Card Offer", href: "/admin/card-offers/new" },
    { label: "Add Points Offer", href: "/admin/points/new" },
    { label: "Add OzBargain Signal", href: "/admin/signals/new" },
    { label: "Compose Weekly Deal", href: "/admin/weekly-deals/new" },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live counts straight from Supabase. Signed in as {email}.
        </p>
      </header>

      <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Manual review required.</span>{" "}
        All published deal data is reviewed and approved by an admin. The feed
        monitor may stage items for review, but nothing is published without an
        explicit admin action.
      </p>

      {/* Overview — existing per-section count cards. */}
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Card key={section.title} className="flex flex-col">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums">
                    {section.total}
                  </span>
                  <span className="text-xs text-muted-foreground">total</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {section.stats.map((stat) => (
                    <span key={stat.label}>
                      <span className="font-medium text-foreground tabular-nums">
                        {stat.value}
                      </span>{" "}
                      {stat.label}
                    </span>
                  ))}
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" size="sm">
                  <Link href={section.href}>Manage</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* Needs attention + Quick actions, side by side on large screens. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>
              {attentionTotal === 0
                ? "All clear — every draft is published and signals are reviewed."
                : `${attentionTotal} ${attentionTotal === 1 ? "item" : "items"} waiting on you.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-2">
            {attention.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
              >
                <span
                  className={
                    item.value > 0
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {item.label}
                </span>
                <Badge
                  variant={item.value > 0 ? "default" : "outline"}
                  className="tabular-nums"
                >
                  {item.value}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Jump straight into manual entry.</CardDescription>
          </CardHeader>
          <CardContent className="grid flex-1 gap-2 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Button
                key={action.href}
                asChild
                variant="outline"
                className="justify-start"
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Data quality — issues on published offers / approved signals. */}
      <Card id="data-quality" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Data quality</CardTitle>
          <CardDescription>
            Checks across published offers and approved signals — the rows the
            public site can show.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* How to act on these flags — cleanup is reversible, never destructive. */}
          <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Cleaning up old data.</span>{" "}
            Expired items should be <strong className="font-medium text-foreground">unpublished, not deleted</strong> —
            use the Edit screen and turn off “Published”. Old staged feed items
            can be <strong className="font-medium text-foreground">ignored</strong> in the{" "}
            <Link href="/admin/signals/queue" className="underline">
              feed queue
            </Link>
            . Always use admin edits for production data; nothing here is
            hard-deleted. A dry-run helper (<code className="font-mono">npm run cleanup:old-deals</code>)
            previews these same changes before any are applied.
          </p>

          {/* Per-issue-type summary tiles, each with a plain-English meaning. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {dataQualityMetrics.map((metric) => (
              <div
                key={metric.code}
                className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2"
              >
                <p className="text-xs font-medium">{metric.label}</p>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    metric.value > 0 &&
                      (metric.code === "expired"
                        ? "text-destructive"
                        : "text-amber-600 dark:text-amber-400")
                  )}
                >
                  {metric.value}
                </p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {metric.explanation}
                </p>
              </div>
            ))}
          </div>

          {Object.values(dataQuality.staleByType).some((count) => count > 0) ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">Stale by type:</span>
              {Object.entries(dataQuality.staleByType)
                .filter(([, count]) => count > 0)
                .map(([type, count]) => (
                  <Badge key={type} variant="outline">
                    {type}: {count}
                  </Badge>
                ))}
            </div>
          ) : null}

          {dataQuality.flaggedItems === 0 ? (
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p>
                No data-quality issues found on published offers or approved
                signals.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedFlags.map((flag) => (
                <div
                  key={`${flag.type}-${flag.id}`}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <AlertTriangle
                        className={cn(
                          "size-3.5 shrink-0",
                          flag.severity === "high"
                            ? "text-destructive"
                            : "text-amber-600 dark:text-amber-400"
                        )}
                      />
                      <Badge variant="secondary" className="text-[10px]">
                        {flag.typeLabel}
                      </Badge>
                      <span className="font-medium break-words">
                        {flag.title}
                      </span>
                    </span>
                    {/* One chip per failed check (grouped by issue type). */}
                    <span className="flex flex-wrap gap-1">
                      {flag.issues.map((issue) => (
                        <span
                          key={issue.code}
                          title={DQ_ISSUE_INFO[issue.code].explanation}
                          className={cn(
                            "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
                            DQ_ISSUE_INFO[issue.code].tone
                          )}
                        >
                          {issue.label}
                        </span>
                      ))}
                    </span>
                    {(flag.expiryDate || flag.lastCheckedAt) && (
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {flag.expiryDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3" />
                            Expires {formatDateAU(flag.expiryDate)}
                          </span>
                        )}
                        {flag.lastCheckedAt && (
                          <span className="inline-flex items-center gap-1">
                            <RefreshCw className="size-3" />
                            Checked {formatDateAU(flag.lastCheckedAt)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* Only a `stale` flag on a table with a last_checked_at
                        column is clearable here — never a placeholder/expired
                        flag, which needs a real edit. */}
                    {flag.issues.some((i) => i.code === "stale") &&
                    recheckTableFor(flag.type) ? (
                      <ActionButton
                        run={markRechecked.bind(null, flag.type, flag.id)}
                        size="xs"
                        title="Confirms you re-verified this offer at its source just now. Updates only the last-checked time."
                      >
                        Mark re-checked
                      </ActionButton>
                    ) : null}
                    <Button asChild variant="ghost" size="sm">
                      <Link href={flag.editHref}>Edit in {flag.typeLabel}</Link>
                    </Button>
                  </div>
                </div>
              ))}

              {dataQuality.flaggedItems > DQ_FLAG_LIMIT ? (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Showing {displayedFlags.length} of {dataQuality.flaggedItems}{" "}
                    flagged items
                  </p>
                  {showAllFlags ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/admin/dashboard#data-quality">
                        Show top {DQ_FLAG_LIMIT}
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/admin/dashboard?dq=all#data-quality">
                        Show all {dataQuality.flaggedItems}
                      </Link>
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DB data freshness checklist — static read-only guidance. */}
      <Card id="db-freshness">
        <CardHeader>
          <CardTitle>DB data freshness</CardTitle>
          <CardDescription>
            How to keep the live site in sync after editing seed data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground marker:text-foreground">
            <li>
              <span className="text-foreground font-medium">Production is DB-first.</span>{" "}
              The site reads from Supabase even in development — static files (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">lib/data.ts</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">lib/offers/manualOffers.ts</code>)
              are a fallback only used when the DB is empty or unreachable.
            </li>
            <li>
              <span className="text-foreground font-medium">After editing seed files, re-seed the DB.</span>{" "}
              Run{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">nvm use 22 &amp;&amp; npm run seed</code>{" "}
              (Node 22+ required for native WebSocket). The seed upserts on{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">id</code> — safe to re-run.
            </li>
            <li>
              <span className="text-foreground font-medium">Prefer admin pages for live offer edits.</span>{" "}
              Edit rates, dates, and expiry directly in the admin portal so changes
              persist without a re-seed and go through the normal review flow.
            </li>
            <li>
              <span className="text-foreground font-medium">Re-seeding overwrites sample signal rows.</span>{" "}
              The ~13 sample <code className="rounded bg-muted px-1 py-0.5 text-xs">ozbargain_signals</code>{" "}
              seeded from static files are replaced on re-seed. Real imported signals (imported via the
              queue) are separate rows and are not affected.
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Recent updates — latest changed items across every section. */}
      <Card>
        <CardHeader>
          <CardTitle>Recent updates</CardTitle>
          <CardDescription>
            The five most recently edited items across all sections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nothing edited yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`}>
                    <TableCell className="text-muted-foreground">
                      {item.typeLabel}
                    </TableCell>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>
                      <Badge variant={item.isLive ? "default" : "secondary"}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {RECENT_DATE_FMT.format(new Date(item.updatedAt))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={item.editHref}>Edit</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
