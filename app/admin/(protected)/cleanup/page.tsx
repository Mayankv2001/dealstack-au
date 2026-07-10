import type { Metadata } from "next";
import Link from "next/link";
import { Info, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listCleanupCandidates,
  type CleanupCandidates,
  type ReportRow,
  type UnpublishTable,
} from "@/lib/admin/repos/cleanup";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActionButton } from "@/components/admin/ActionButton";
import {
  applySectionAction,
  expireSignalAction,
  ignoreStaleFeedItemAction,
  unpublishExpiredAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Cleanup | DealStack AU admin",
};

/** Edit-page route segment per offer table (for report-only links). */
const EDIT_SEGMENT: Record<UnpublishTable, string> = {
  cashback_offers: "cashback",
  gift_card_offers: "gift-cards",
  points_offers: "points",
  card_offers: "card-offers",
  weekly_deals: "weekly-deals",
};

/** Human table name for section subtitles. */
const TABLE_LABEL: Record<UnpublishTable, string> = {
  cashback_offers: "Cashback",
  gift_card_offers: "Gift cards",
  points_offers: "Points",
  card_offers: "Card offers",
  weekly_deals: "Weekly deals",
};

function EmptyNote() {
  return <p className="text-sm text-muted-foreground">(none)</p>;
}

/** A compact row: label + secondary meta on the left, action on the right. */
function CandidateRow({
  label,
  meta,
  action,
}: {
  label: string;
  meta: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{meta}</p>
      </div>
      {action}
    </div>
  );
}

function ReportList({ rows }: { rows: ReportRow[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div
          key={`${r.table}:${r.id}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">
              {r.label}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                · {TABLE_LABEL[r.table]}
              </span>
            </p>
            {r.markers.length > 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {r.markers.map((m) => `"${m}"`).join(", ")}
              </p>
            ) : null}
          </div>
          <Link
            href={`/admin/${EDIT_SEGMENT[r.table]}/${r.id}/edit`}
            className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Edit →
          </Link>
        </div>
      ))}
    </div>
  );
}

export default async function CleanupPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const data: CleanupCandidates = await listCleanupCandidates(new Date());

  const {
    today,
    staleFeedDays,
    expiredOffers,
    expiredSignals,
    staleFeedItems,
    publishedNoExpiry,
    placeholderCopy,
  } = data;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Cleanup</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Nothing here deletes or publishes. Actions unpublish, expire, or ignore
          — the same changes as{" "}
          <code className="text-xs">npm run cleanup:old-deals -- --write</code>,
          with an audit trail. Every apply re-checks the row still qualifies, so
          acting on a stale list is safe. Dates use the Australia/Sydney calendar
          (a row expiring today is not yet expired).
        </p>
      </header>

      <div className="flex items-start gap-2.5 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          AU today: <span className="font-medium text-foreground tabular-nums">{today}</span>.
          Stale staged-item window: {staleFeedDays} days. Applied changes are
          recorded on{" "}
          <Link href="/admin/audit" className="underline">
            Audit
          </Link>{" "}
          as <code className="text-xs">cleanup-*</code> actions.
        </p>
      </div>

      {/* Expired offers → unpublish. */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trash2 className="size-5 text-muted-foreground" />
              Published but expired ({expiredOffers.length})
            </CardTitle>
            {expiredOffers.length > 0 ? (
              <ActionButton
                run={() => applySectionAction("expired-offers")}
                confirm={`Unpublish all ${expiredOffers.length} expired offer${
                  expiredOffers.length === 1 ? "" : "s"
                }? They disappear from public listings. Nothing is deleted.`}
              >
                Apply all ({expiredOffers.length})
              </ActionButton>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {expiredOffers.length === 0 ? (
            <EmptyNote />
          ) : (
            expiredOffers.map((c) => (
              <CandidateRow
                key={`${c.table}:${c.id}`}
                label={`${c.label} · ${TABLE_LABEL[c.table]}`}
                meta={`expired ${c.expiryDate}`}
                action={
                  <ActionButton
                    run={() => unpublishExpiredAction(c.table, c.id, c.merchantId)}
                    confirm={`Unpublish "${c.label}"? It disappears from public listings. Nothing is deleted.`}
                  >
                    Unpublish
                  </ActionButton>
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Expired signals → status='expired'. */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">
              Expired signals ({expiredSignals.length})
            </CardTitle>
            {expiredSignals.length > 0 ? (
              <ActionButton
                run={() => applySectionAction("expired-signals")}
                confirm={`Mark all ${expiredSignals.length} expired signal${
                  expiredSignals.length === 1 ? "" : "s"
                } as expired?`}
              >
                Apply all ({expiredSignals.length})
              </ActionButton>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {expiredSignals.length === 0 ? (
            <EmptyNote />
          ) : (
            expiredSignals.map((c) => (
              <CandidateRow
                key={c.id}
                label={c.label}
                meta={`[${c.status}] expired ${c.expiryDate}`}
                action={
                  <ActionButton
                    run={() => expireSignalAction(c.id)}
                    confirm={`Mark "${c.label}" as expired? It stops appearing as a live signal.`}
                  >
                    Expire
                  </ActionButton>
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Abandoned staged feed items → ignored. */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">
              Abandoned staged feed items ({staleFeedItems.length})
            </CardTitle>
            {staleFeedItems.length > 0 ? (
              <ActionButton
                run={() => applySectionAction("stale-feed")}
                confirm={`Ignore all ${staleFeedItems.length} staged feed item${
                  staleFeedItems.length === 1 ? "" : "s"
                } older than ${staleFeedDays} days?`}
              >
                Apply all ({staleFeedItems.length})
              </ActionButton>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {staleFeedItems.length === 0 ? (
            <EmptyNote />
          ) : (
            staleFeedItems.map((c) => (
              <CandidateRow
                key={c.id}
                label={c.label}
                meta={`posted ${c.postedAt.slice(0, 10)}`}
                action={
                  <ActionButton
                    run={() => ignoreStaleFeedItemAction(c.id)}
                    confirm={`Ignore "${c.label}"? It is removed from the review queue (kept for audit).`}
                  >
                    Ignore
                  </ActionButton>
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Report-only: published with no expiry. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Published with no expiry — review manually ({publishedNoExpiry.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-muted-foreground">
            These may be intentionally evergreen (e.g. base earn rates) — never
            auto-changed. Open each to set an expiry or confirm it is ongoing.
          </p>
          {publishedNoExpiry.length === 0 ? (
            <EmptyNote />
          ) : (
            <ReportList rows={publishedNoExpiry} />
          )}
        </CardContent>
      </Card>

      {/* Report-only: placeholder copy. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Placeholder copy — replace with verified details ({placeholderCopy.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-muted-foreground">
            Published rows whose text still carries demo/illustrative wording.
            Replace the copy with verified offer details, then re-publish.
          </p>
          {placeholderCopy.length === 0 ? (
            <EmptyNote />
          ) : (
            <ReportList rows={placeholderCopy} />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        The scriptable equivalent is{" "}
        <code className="text-xs">npm run cleanup:old-deals</code> (dry-run) /{" "}
        <code className="text-xs">-- --write</code>. Both paths make identical
        changes; this page adds per-admin audit and a click-to-confirm review.
      </p>
    </div>
  );
}
