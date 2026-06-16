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
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getDashboardCounts,
  getDataQualityReport,
  getRecentUpdates,
} from "@/lib/admin/repos/dashboard";
import { countNewFeedItems } from "@/lib/admin/repos/feedQueue";
import { cn } from "@/lib/utils";

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
// timeZone keep server-rendered output stable (this page has no client island).
const RECENT_DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

export default async function AdminDashboardPage() {
  // Belt-and-suspenders: the protected layout already gates, but every admin
  // page verifies independently (proxy is only an optimistic check).
  const { email } = await requireAdmin();
  const [counts, recent, feedQueueCount, dataQuality] = await Promise.all([
    getDashboardCounts(),
    getRecentUpdates(5),
    countNewFeedItems(),
    getDataQualityReport(),
  ]);

  const sections: Section[] = [
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
      label: "Unpublished points offers",
      value: counts.points.unpublished,
      href: "/admin/points",
    },
    {
      label: "Unpublished weekly deals",
      value: counts.weeklyDeals.unpublished,
      href: "/admin/weekly-deals",
    },
  ];
  const attentionTotal = attention.reduce((sum, a) => sum + a.value, 0);

  // Read-only data-quality metrics over published offers + approved signals.
  const dataQualityMetrics = [
    { label: "Expired but still live", value: dataQuality.counts.expiredPublished },
    { label: "Missing source URL", value: dataQuality.counts.missingSourceUrl },
    { label: "Missing expiry date", value: dataQuality.counts.missingExpiry },
    { label: "Not re-checked 30+ days", value: dataQuality.counts.staleChecked },
  ];

  const quickActions = [
    { label: "Monitor Status", href: "/admin/monitor" },
    { label: "Review Feed Queue", href: "/admin/signals/queue" },
    { label: "Add Cashback Rate", href: "/admin/cashback/new" },
    { label: "Add Gift Card Offer", href: "/admin/gift-cards/new" },
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
        <span className="font-medium text-foreground">Manual admin only.</span>{" "}
        All deal data is manually entered or curated. No scraping or automated
        source fetching is running.
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
      <Card>
        <CardHeader>
          <CardTitle>Data quality</CardTitle>
          <CardDescription>
            Checks across published offers and approved signals — the rows the
            public site can show.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {dataQualityMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-md border bg-muted/30 px-3 py-2"
              >
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    metric.value > 0 && "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

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
              {dataQuality.flags.map((flag) => (
                <div
                  key={`${flag.type}-${flag.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle
                        className={cn(
                          "size-3.5 shrink-0",
                          flag.severity === "high"
                            ? "text-destructive"
                            : "text-amber-600 dark:text-amber-400"
                        )}
                      />
                      <span className="text-xs text-muted-foreground">
                        {flag.typeLabel}
                      </span>
                      <span className="font-medium break-words">
                        {flag.title}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {flag.reason}
                    </span>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={flag.editHref}>Edit</Link>
                  </Button>
                </div>
              ))}
              {dataQuality.flaggedItems > dataQuality.flags.length ? (
                <p className="text-xs text-muted-foreground">
                  Showing {dataQuality.flags.length} of{" "}
                  {dataQuality.flaggedItems} flagged items.
                </p>
              ) : null}
            </div>
          )}
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
