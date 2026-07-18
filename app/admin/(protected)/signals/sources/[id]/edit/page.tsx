import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getFeedSource,
  listStoreOptions,
} from "@/lib/admin/repos/feedSources";
import { FeedSourceForm } from "@/components/admin/FeedSourceForm";
import { updateFeedSource } from "../../actions";

export const metadata: Metadata = {
  title: "Edit feed source | DealStack AU admin",
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

export default async function EditFeedSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [source, stores] = await Promise.all([
    getFeedSource(id),
    listStoreOptions(),
  ]);
  if (!source) notFound();

  // Bind the source id so the form's action keeps the (state, formData) shape.
  const action = updateFeedSource.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Edit feed source</h1>
        <p className="text-sm text-muted-foreground">{source.label}</p>
      </header>

      {/* Monitor-managed, read-only state. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Last status</dt>
          <dd className="font-medium">{source.lastStatus ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Failure count</dt>
          <dd className="font-medium tabular-nums">{source.failureCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last fetched</dt>
          <dd className="font-medium tabular-nums">
            {formatDate(source.lastFetchedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Next earliest fetch</dt>
          <dd className="font-medium tabular-nums">
            {formatDate(source.nextEarliestFetchAt)}
          </dd>
        </div>
      </dl>

      <FeedSourceForm
        action={action}
        stores={stores}
        submitLabel="Save changes"
        defaultValues={{
          label: source.label,
          feedUrl: source.feedUrl,
          kind: source.kind,
          merchantId: source.merchantId,
          isEnabled: source.isEnabled,
        }}
      />
    </div>
  );
}
