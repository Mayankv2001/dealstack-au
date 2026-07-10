import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Clock,
  Info,
  Lightbulb,
  ListChecks,
  PowerOff,
  Radar,
  ShieldCheck,
  X,
} from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getMonitorStatus,
  type MonitorFetchLogEntry,
  type MonitorStatus,
} from "@/lib/admin/repos/monitorStatus";
import { getDetectionOpsStatus } from "@/lib/admin/repos/offerChanges";
import { disableAllFeeds } from "./actions";
import { ozbOfferDetectEnabled } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StagingFlowViz } from "@/components/monitor/staging-flow-viz";
import { ActionButton } from "@/components/admin/ActionButton";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Monitor status | DealStack AU admin",
};

// Deterministic AU-local timestamp (server-only render).
const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function formatDate(iso: string | null): string {
  return iso ? DATE_FMT.format(new Date(iso)) : "—";
}

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold",
            tone === "ok" && "text-emerald-600 dark:text-emerald-400",
            tone === "warn" && "text-amber-600 dark:text-amber-400"
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Compact summary of a single fetch-log row (last success / last problem). */
function FetchLogSummary({
  log,
  emptyText,
}: {
  log: MonitorFetchLogEntry | null;
  emptyText: string;
}) {
  if (!log) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{log.feedSourceLabel ?? "—"}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {formatDate(log.startedAt)} · HTTP {log.httpStatus ?? "—"} · seen{" "}
        {log.itemsSeen} · new {log.itemsNew}
      </p>
      {log.error ? (
        <p className="break-words text-xs text-destructive">{log.error}</p>
      ) : null}
    </div>
  );
}

/** One row of the "Cron ready?" checklist — derived, read-only. */
interface CronCheck {
  label: string;
  ok: boolean;
  hint: string;
}

/** The six prerequisites for the scheduled cron to actually do useful work. */
function cronChecklist(status: MonitorStatus): CronCheck[] {
  return [
    {
      label: "CRON_SECRET configured",
      ok: status.cronSecretConfigured,
      hint: status.cronSecretConfigured
        ? "The cron route can authenticate."
        : "Without it the cron route returns 503 and never runs.",
    },
    {
      label: "Monitor enabled",
      ok: status.envEnabled,
      hint: `OZB_MONITOR_ENABLED = ${status.envEnabledRaw ?? "unset"}.`,
    },
    {
      label: "Compliance approved",
      ok: status.complianceApproved,
      hint: status.complianceApproved
        ? "An approved review is on file."
        : "Record and approve a review first.",
    },
    {
      label: "At least one feed source enabled",
      ok: status.feedSourcesEnabled > 0,
      hint: `${status.feedSourcesEnabled} of ${status.feedSourcesTotal} enabled.`,
    },
    {
      label: "Last successful run exists",
      ok: status.lastSuccessLog != null,
      hint: status.lastSuccessLog
        ? `Last clean run ${formatDate(status.lastSuccessLog.startedAt)}.`
        : "No successful run recorded yet.",
    },
    {
      label: "Queue has staged items",
      ok: status.feedQueuePending > 0,
      hint: `${status.feedQueuePending} awaiting review.`,
    },
  ];
}

type NextActionTone = "ok" | "warn" | "info";

interface NextAction {
  message: string;
  tone: NextActionTone;
  href?: string;
  hrefLabel?: string;
}

/**
 * The single most useful next step, chosen by walking the prerequisites in
 * dependency order. Purely advisory — it never enables, disables, or runs
 * anything, and it never suggests arming the monitor before compliance is
 * approved (compliance is checked first).
 */
function recommendedAction(status: MonitorStatus): NextAction {
  if (!status.complianceApproved) {
    return {
      message:
        "Record and approve a compliance review before enabling anything.",
      tone: "warn",
      href: "/admin/compliance",
      hrefLabel: "Compliance",
    };
  }
  if (!status.cronSecretConfigured) {
    return {
      message:
        "Set CRON_SECRET in your deployment env — the cron route returns 503 until it is configured. (The manual monitor:feeds script does not need it.)",
      tone: "warn",
    };
  }
  if (!status.envEnabled) {
    return {
      message:
        "Set OZB_MONITOR_ENABLED=true in your deployment env to arm the monitor.",
      tone: "info",
    };
  }
  if (status.feedSourcesEnabled === 0) {
    return {
      message:
        "Enable at least one feed source so the cron has something to fetch.",
      tone: "warn",
      href: "/admin/signals/sources",
      hrefLabel: "Feed Sources",
    };
  }
  if (!status.lastSuccessLog) {
    return {
      message:
        "Configured — waiting for the first successful run. The cron runs daily at 02:00 UTC; check Recent fetch runs below.",
      tone: "info",
    };
  }
  if (status.feedQueuePending === 0) {
    return {
      message:
        "Running, but nothing is awaiting review right now. No action needed.",
      tone: "ok",
    };
  }
  return {
    message: `Ready — review the ${status.feedQueuePending} staged item${
      status.feedQueuePending === 1 ? "" : "s"
    } in the queue.`,
    tone: "ok",
    href: "/admin/signals/queue",
    hrefLabel: "Feed import queue",
  };
}

export default async function MonitorStatusPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  // Fetch both read-only snapshots together (no waterfall). The flag is read
  // per-request via the env accessor — never inline process.env.
  const [status, detection] = await Promise.all([
    getMonitorStatus(),
    getDetectionOpsStatus(),
  ]);
  const detectionEnabled = ozbOfferDetectEnabled();

  const hasRisk = status.enabledWithoutApproval > 0;
  const checklist = cronChecklist(status);
  const nextAction = recommendedAction(status);
  // Operational warnings called out specifically for cron safety.
  const enabledNoFeeds = status.envEnabled && status.feedSourcesEnabled === 0;
  const feedsNoSecret =
    status.feedSourcesEnabled > 0 && !status.cronSecretConfigured;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Monitor status</h1>
        <p className="text-sm text-muted-foreground">
          Read-only health snapshot of the OzBargain monitor. This page never
          fetches feeds. Fetching only happens — when enabled — via the manual{" "}
          <code className="text-xs">monitor:feeds</code> script or the
          secret-gated Vercel Cron route. Nothing is published automatically.
        </p>
      </header>

      {/* Category auto-ignore note — explains the monitor's initial review_state. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-medium text-foreground">
            Category-aware staging.
          </span>{" "}
          Future RSS items are sorted on arrival by preferred category. Tech,
          fashion, gift cards, beauty, automotive and household/appliance deals
          (and anything uncertain) are staged as <code className="text-xs">new</code>{" "}
          for review in the{" "}
          <Link href="/admin/signals/queue" className="underline">
            feed queue
          </Link>
          . Clearly off-theme items (alcohol, anime/collectibles, gaming
          pre-orders, snacks, supplements, pets, travel) are staged as{" "}
          <code className="text-xs">ignored</code> — still saved for audit, just
          hidden from the queue. Nothing is deleted, and nothing is ever
          published without manual approval.
        </p>
      </div>

      {/* Most severe: the master switch is armed but compliance is NOT approved. */}
      {status.envEnabled && !status.complianceApproved ? (
        <div className="flex items-start gap-2.5 rounded-lg border-2 border-destructive bg-destructive/15 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p>
            <span className="font-semibold text-destructive">
              Stop — unsafe configuration.
            </span>{" "}
            <code className="text-xs">OZB_MONITOR_ENABLED</code> is{" "}
            <code className="text-xs">true</code> but no compliance review is
            approved. Set <code className="text-xs">OZB_MONITOR_ENABLED=false</code>{" "}
            until an approved review is on file — do not run the monitor.
          </p>
        </div>
      ) : null}

      {/* Risk: feeds enabled while compliance is not approved. */}
      {hasRisk ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            <span className="font-medium text-destructive">Risk:</span>{" "}
            {status.enabledWithoutApproval}{" "}
            {status.enabledWithoutApproval === 1
              ? "feed source is"
              : "feed sources are"}{" "}
            enabled while compliance is not approved. Disable{" "}
            {status.enabledWithoutApproval === 1 ? "it" : "them"} until an
            approved review is on file.
          </p>
        </div>
      ) : null}

      {/* Gate: compliance must be approved before monitoring. */}
      {!status.complianceApproved ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="font-medium text-foreground">
            Monitoring must stay disabled until compliance review is approved.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p>
            An approved compliance review is on file. Enabling a feed and
            running the monitor are still separate, deliberate steps.
          </p>
        </div>
      )}

      {/* Master switch state. */}
      {!status.envEnabled ? (
        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
          <p>
            <span className="font-medium text-foreground">
              Monitor master switch is off.
            </span>{" "}
            <code className="text-xs">OZB_MONITOR_ENABLED</code> ={" "}
            <code className="text-xs">{status.envEnabledRaw ?? "unset"}</code>.
          </p>
        </div>
      ) : null}

      {/* Cron op-safety: enabled but nothing to fetch. */}
      {enabledNoFeeds ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            <span className="font-medium text-foreground">
              Monitor is enabled but no feed sources are enabled.
            </span>{" "}
            The cron will run on schedule and fetch nothing. Enable a feed on{" "}
            <Link href="/admin/signals/sources" className="underline">
              Feed Sources
            </Link>{" "}
            or set <code className="text-xs">OZB_MONITOR_ENABLED=false</code>.
          </p>
        </div>
      ) : null}

      {/* Cron op-safety: feeds enabled but the cron route can't authenticate. */}
      {feedsNoSecret ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            <span className="font-medium text-foreground">
              Feed sources are enabled but <code className="text-xs">CRON_SECRET</code>{" "}
              appears missing.
            </span>{" "}
            The Vercel Cron route will return <code className="text-xs">503</code>{" "}
            and never run until it is set in the deployment env. (The manual{" "}
            <code className="text-xs">monitor:feeds</code> script still works.)
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Master switch (OZB_MONITOR_ENABLED)"
          value={status.envEnabled ? "On" : "Off"}
          tone={status.envEnabled ? "warn" : "muted"}
          hint={`Value: ${status.envEnabledRaw ?? "unset"}`}
        />
        <StatCard
          label="Compliance approved"
          value={status.complianceApproved ? "Yes" : "No"}
          tone={status.complianceApproved ? "ok" : "warn"}
        />
        <StatCard
          label="Feed sources"
          value={`${status.feedSourcesEnabled} / ${status.feedSourcesTotal}`}
          hint="Enabled / total"
        />
        <StatCard
          label="Feed queue pending"
          value={String(status.feedQueuePending)}
          hint="Items awaiting review"
        />
      </div>

      {/* Staging-flow visualisation — illustrative only. "Live" means the
          monitor is armed (enabled + compliance-approved + at least one feed),
          not that a fetch is in flight; this page never fetches. */}
      <StagingFlowViz
        isFetching={
          status.envEnabled &&
          status.complianceApproved &&
          status.feedSourcesEnabled > 0
        }
        stagedItemCount={status.feedItemsTotal}
        activeSources={status.feedSourcesEnabled}
        pendingCount={status.feedQueuePending}
      />

      {/* Cron readiness — operator checklist + a single recommended next action. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListChecks className="size-5 text-muted-foreground" />
            Cron ready?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recommended next action (advisory only — never runs anything). */}
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm",
              nextAction.tone === "ok" &&
                "border-emerald-500/30 bg-emerald-500/10",
              nextAction.tone === "warn" &&
                "border-amber-500/30 bg-amber-500/10",
              nextAction.tone === "info" && "bg-muted/40"
            )}
          >
            <Lightbulb
              className={cn(
                "mt-0.5 size-4 shrink-0",
                nextAction.tone === "ok" &&
                  "text-emerald-600 dark:text-emerald-400",
                nextAction.tone === "warn" &&
                  "text-amber-600 dark:text-amber-400",
                nextAction.tone === "info" && "text-foreground"
              )}
            />
            <p>
              <span className="font-medium text-foreground">
                Recommended next action:
              </span>{" "}
              {nextAction.message}
              {nextAction.href ? (
                <>
                  {" "}
                  <Link href={nextAction.href} className="underline">
                    {nextAction.hrefLabel}
                  </Link>
                </>
              ) : null}
            </p>
          </div>

          {/* Six-point readiness checklist. */}
          <ul className="space-y-2">
            {checklist.map((check) => (
              <li key={check.label} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                    check.ok
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {check.ok ? (
                    <Check className="size-3" />
                  ) : (
                    <X className="size-3" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm",
                      check.ok ? "font-medium" : "text-muted-foreground"
                    )}
                  >
                    {check.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{check.hint}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Scheduler options — informational only; this page runs nothing and
          cannot detect whether an external scheduler is configured. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="size-5 text-muted-foreground" />
            Scheduler options
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The same secret-gated route (
            <code className="text-xs">GET /api/cron/monitor-feeds</code>) can be
            triggered two ways. Both pass through every gate in “Cron ready?”
            above, stage only <code className="text-xs">feed_items</code> /
            fetch-log / poll-state, and never publish anything automatically —
            admin review stays mandatory.
          </p>
          <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
            <p className="font-medium">Vercel Cron — once daily</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Runs at 02:00 UTC, configured in{" "}
              <code className="text-xs">vercel.json</code>. Kept once daily on
              the Hobby plan so deploys stay valid.
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
            <p className="font-medium">
              External scheduler — every 3 hours{" "}
              <span className="font-normal text-muted-foreground">
                (optional, if configured)
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              An external scheduler (e.g. cron-job.org) can call the same route
              every 3 hours with{" "}
              <code className="text-xs">Authorization: Bearer ${"{CRON_SECRET}"}</code>
              . Per-feed polling is still throttled by{" "}
              <code className="text-xs">OZB_MONITOR_MIN_INTERVAL_HOURS</code>{" "}
              (default 12h), so most extra calls find nothing due. Setup steps are
              in <code className="text-xs">docs/ozbargain-monitoring.md</code>.
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            This page can’t detect whether an external scheduler is set up — it
            only reflects the run history below.
          </p>
        </CardContent>
      </Card>

      {/* How to stop the monitor — always visible so admins can act quickly. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PowerOff className="size-5 text-muted-foreground" />
            How to stop monitoring
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Two ways to disable the monitor. Neither deletes staged items or
            changes any published offer.
          </p>
          <div className="rounded-md border bg-muted/30 px-3 py-2.5">
            <p className="font-medium">Option 1 — Vercel env var (preferred)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              In Vercel Dashboard → Project → Settings → Environment Variables,
              set <code className="text-xs">OZB_MONITOR_ENABLED</code> to{" "}
              <code className="text-xs">false</code> (or delete it), then
              redeploy. Takes effect on the next deployment.
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2.5">
            <p className="font-medium">Option 2 — disable feed sources (immediate, no redeploy)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The cron will still run on schedule but find no enabled sources
              and exit immediately. Staged feed items remain available for
              review; public data is unchanged.
            </p>
            {status.feedSourcesEnabled > 0 ? (
              <ActionButton
                run={disableAllFeeds}
                confirm="Disable all enabled feed sources now? This does not delete staged items or change public data."
                variant="destructive"
                className="mt-2"
              >
                <PowerOff className="size-3.5" />
                Disable all feed sources ({status.feedSourcesEnabled})
              </ActionButton>
            ) : (
              <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                No feed sources are currently enabled.
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Full emergency steps and rollback plan are in{" "}
            <code className="text-xs">docs/production-readiness.md</code>.
          </p>
        </CardContent>
      </Card>

      {/* Staged feed items by triage state. */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">
              Staged feed items ({status.feedItemsTotal})
            </CardTitle>
            {status.feedQueuePending > 0 ? (
              <Link
                href="/admin/signals/queue"
                className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Review queue ({status.feedQueuePending} pending) →
              </Link>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CountPill label="New" value={status.feedItemCounts.new} />
            <CountPill label="Imported" value={status.feedItemCounts.imported} />
            <CountPill label="Ignored" value={status.feedItemCounts.ignored} />
            <CountPill label="Duplicate" value={status.feedItemCounts.duplicate} />
          </div>
        </CardContent>
      </Card>

      {/* Offer-change detection — read-only ops status. This page never runs
          detection; the flag gates the post-run staging hook in the cron route,
          reviewed and flipped by a human per the go-live runbook. */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radar className="size-5 text-muted-foreground" />
              Offer-change detection
            </CardTitle>
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                detectionEnabled
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {detectionEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <code className="text-xs">OZB_OFFER_DETECT_ENABLED</code> ={" "}
            <code className="text-xs">{detectionEnabled ? "true" : "false"}</code>.
            Gates the post-run staging hook only — the{" "}
            <Link href="/admin/offer-changes" className="underline">
              preview panel
            </Link>{" "}
            works regardless.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <CountPill label="Total" value={detection.totalCandidates} />
            <CountPill label="New" value={detection.byReviewState.new} />
            <CountPill label="Applied" value={detection.byReviewState.applied} />
            <CountPill label="Ignored" value={detection.byReviewState.ignored} />
            <CountPill
              label="Duplicate"
              value={detection.byReviewState.duplicate}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Last candidate staged:
            </span>{" "}
            {detection.latestStagedAt ? (
              <span className="tabular-nums">
                {formatDate(detection.latestStagedAt)}
              </span>
            ) : (
              "Never — detection has not run in write mode."
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link
              href="/admin/offer-changes"
              className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Review candidates / run a preview →
            </Link>
            <span className="text-xs text-muted-foreground">
              Go-live runbook:{" "}
              <code className="text-xs">docs/ozbargain-monitoring.md</code>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Last successful vs last problem fetch run. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last successful run</CardTitle>
          </CardHeader>
          <CardContent>
            <FetchLogSummary
              log={status.lastSuccessLog}
              emptyText="No successful run recorded yet."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last blocked / error run</CardTitle>
          </CardHeader>
          <CardContent>
            <FetchLogSummary
              log={status.lastProblemLog}
              emptyText="No blocked or error runs recorded."
            />
          </CardContent>
        </Card>
      </div>

      {/* Error / blocked feed sources. */}
      {status.problemSources.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Error / blocked feed sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.problemSources.map((source) => (
              <div
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">{source.label}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-destructive">
                    {source.lastStatus}
                  </Badge>
                  <span className="tabular-nums">
                    {source.failureCount} failures
                  </span>
                  <span>{source.isEnabled ? "enabled" : "disabled"}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Latest staged feed items (any state). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Latest feed items</CardTitle>
        </CardHeader>
        <CardContent>
          {status.latestFeedItems.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No feed items staged yet. Run{" "}
              <code className="text-xs">npm run monitor:feeds -- --write</code> to
              stage items from an enabled feed.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Feed</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Native id</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Fetched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.latestFeedItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-xs truncate font-medium">
                      {item.rawTitle}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.feedSourceLabel ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {item.reviewState}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate font-mono text-xs text-muted-foreground">
                      {item.sourceNativeId}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.contentHash ? `${item.contentHash.slice(0, 10)}…` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(item.fetchedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent fetch runs (latest 5). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent fetch runs</CardTitle>
        </CardHeader>
        <CardContent>
          {status.recentFetchLog.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No monitor runs recorded yet. Runs appear here after{" "}
              <code className="text-xs">npm run monitor:feeds -- --write</code>.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead className="text-right">HTTP</TableHead>
                  <TableHead className="text-right">Seen</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.recentFetchLog.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.feedSourceLabel ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(entry.startedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(entry.finishedAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.httpStatus ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.itemsSeen}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.itemsNew}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {entry.error ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This page is read-only — it never fetches feeds. Manage the allowlist on{" "}
        <Link href="/admin/signals/sources" className="underline">
          Feed Sources
        </Link>{" "}
        and record the review on{" "}
        <Link href="/admin/compliance" className="underline">
          Compliance
        </Link>
        .
      </p>
    </div>
  );
}
