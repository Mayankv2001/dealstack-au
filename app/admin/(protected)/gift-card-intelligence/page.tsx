import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/ActionButton";
import {
  GiftCardProductCatalogueEditForm,
  GiftCardProductForm,
  ProgrammeEditForm,
  ProgrammeForm,
  ProgrammeRateEditForm,
  ProgrammeRateForm,
} from "@/components/admin/GiftCardIntelligenceForms";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin/auth";
import { getGiftCardIntelligenceAdminData } from "@/lib/admin/repos/giftCardIntelligence";
import { todayAU } from "@/lib/offers/expiry";
import {
  archiveIntelligence,
  resolvePublicCorrection,
  sealOfferHistory,
  toggleGiftCardFactPublished,
  toggleIntelligencePublished,
} from "./actions";

export const metadata: Metadata = {
  title: "Gift-card intelligence | DealStack AU admin",
};
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Melbourne",
});

export default async function GiftCardIntelligencePage() {
  await requireAdmin();
  const data = await getGiftCardIntelligenceAdminData(todayAU());

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Gift-card intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Reviewed products, acceptance, programme catalogues, immutable expired
          occurrences and reader corrections. Nothing here enables recurring ingestion.
        </p>
      </header>

      {!data.schemaAvailable ? (
        <div role="status" className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm">
          <p className="font-semibold">Proposed intelligence schema is not available.</p>
          <p className="mt-1 text-muted-foreground">
            Migrations 024–026 remain unapplied. Existing product and acceptance
            review is available, while catalogue, history and correction controls
            require approval first.
          </p>
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Product and merchant evidence</h2>
          <p className="text-sm text-muted-foreground">
            New facts start private. Publication rechecks evidence URL, checked date,
            status and outcome.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <GiftCardProductForm catalogueAvailable={data.productCatalogueAvailable} />
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Merchant acceptance evidence</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Acceptance now enters through the private candidate queue. That
              flow resolves merchant aliases, validates evidence and publishes
              only through the reviewed approval RPC.
            </p>
            <Link
              href="/admin/gift-cards/acceptance"
              className="mt-4 inline-flex rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted"
            >
              Open acceptance review queue
            </Link>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-semibold">Products</h3>
            {data.products.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div><p className="font-medium">{row.brand}</p><p className="text-xs text-muted-foreground">{row.issuer ?? "Issuer not recorded"} · {row.id}</p>{data.productCatalogueAvailable ? <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Edit catalogue facts</summary><GiftCardProductCatalogueEditForm product={row} /></details> : null}</div>
                <ActionButton run={toggleGiftCardFactPublished.bind(null, "product", row.id, !row.is_active)} size="xs">{row.is_active ? "Deactivate" : "Activate"}</ActionButton>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Acceptance evidence</h3>
            {data.acceptance.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div><p className="font-medium">{row.merchant_name ?? row.merchant_category ?? "Merchant missing"}</p><p className="text-xs text-muted-foreground">{row.product_id} · {row.status} · {row.outcome ?? "outcome missing"}</p></div>
                {row.is_public ? (
                  <ActionButton run={toggleGiftCardFactPublished.bind(null, "acceptance", row.id, false)} size="xs">Unpublish</ActionButton>
                ) : (
                  <Link href="/admin/gift-cards/acceptance" className="text-xs font-semibold text-emerald-700 hover:underline">Review queue</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Programme catalogues</h2>
          <p className="text-sm text-muted-foreground">
            Rates remain separate from short-term offers. Editing appends structured
            rate history; archive replaces destructive deletion.
          </p>
        </div>
        {data.schemaAvailable ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ProgrammeForm />
            <ProgrammeRateForm programmeIds={data.programmes.filter((row) => row.is_ongoing).map((row) => row.id)} />
          </div>
        ) : null}
        <div className="space-y-3">
          {data.programmes.map((row) => (
            <article key={row.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{row.name}</h3>
                  <p className="text-sm text-muted-foreground">{row.provider} · review by {row.review_by_date}</p>
                  <div className="mt-2 flex gap-2"><Badge variant="outline">{row.confidence}</Badge><Badge variant={row.is_published ? "default" : "secondary"}>{row.is_published ? "published" : row.is_ongoing ? "unpublished" : "archived"}</Badge></div>
                </div>
                {row.is_ongoing ? <div className="flex gap-2"><ActionButton run={toggleIntelligencePublished.bind(null, "programme", row.id, !row.is_published)}>{row.is_published ? "Unpublish" : "Publish"}</ActionButton><ActionButton run={archiveIntelligence.bind(null, "programme", row.id)} confirm="Archive this programme and remove it from public results?" variant="destructive">Archive</ActionButton></div> : null}
              </div>
              {row.is_ongoing ? <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Edit reviewed programme</summary><ProgrammeEditForm programme={row} /></details> : null}
              <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
                {data.rates.filter((rate) => rate.programme_id === row.id).map((rate) => (
                  <div key={rate.id} className="rounded-md bg-muted/50 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-medium">{rate.brand_name}</p><p className="text-xs text-muted-foreground">{rate.promotion_type} · {rate.confidence} · review {rate.review_by_date}</p></div>
                      {rate.is_ongoing ? <div className="flex gap-1"><ActionButton run={toggleIntelligencePublished.bind(null, "rate", rate.id, !rate.is_published)} size="xs">{rate.is_published ? "Unpublish" : "Publish"}</ActionButton><ActionButton run={archiveIntelligence.bind(null, "rate", rate.id)} confirm="Archive this rate and append its removal to history?" variant="destructive" size="xs">Archive</ActionButton></div> : <Badge variant="secondary">archived</Badge>}
                    </div>
                    {rate.is_ongoing ? <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Edit rate</summary><ProgrammeRateEditForm rate={rate} /></details> : null}
                    {data.rateHistory.some((history) => history.programme_rate_id === rate.id) ? <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Change history</summary><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{data.rateHistory.filter((history) => history.programme_rate_id === rate.id).slice(0, 20).map((history) => <li key={history.id}>{history.change_kind.replaceAll("-", " ")} · {history.changed_fields.join(", ") || "record added"} · {DATE.format(new Date(history.checked_at))}</li>)}</ul></details> : null}
                  </div>
                ))}
              </div>
            </article>
          ))}
          {data.schemaAvailable && data.programmes.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No reviewed programmes yet.</p> : null}
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-xl font-semibold">Seal expired offer history</h2><p className="text-sm text-muted-foreground">This appends a structured public-safe occurrence. The sealed record cannot be edited or deleted.</p></div>
        {data.schemaAvailable ? data.historyCandidates.map((offer) => (
          <article key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><h3 className="font-semibold">{offer.brand}</h3><p className="text-sm text-muted-foreground">{offer.seller ?? "Seller missing"} · {offer.promotionType} · ended {offer.expiryDate}</p></div><ActionButton run={sealOfferHistory.bind(null, offer.id)} confirm="Seal this expired offer into immutable public history?">Seal occurrence</ActionButton></article>
        )) : null}
        {data.schemaAvailable && data.historyCandidates.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No unsealed expired offers.</p> : null}
      </section>

      <section className="space-y-3">
        <div><h2 className="text-xl font-semibold">Public correction queue</h2><p className="text-sm text-muted-foreground">Reports are review inputs only and never mutate public records automatically.</p></div>
        {data.corrections.map((report) => (
          <article key={report.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{report.reported_label}</h3><p className="text-xs text-muted-foreground">{report.entity_type} · {report.reason} · {DATE.format(new Date(report.created_at))}</p></div><Badge variant={report.status === "new" ? "destructive" : "secondary"}>{report.status}</Badge></div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{report.details}</p>
            {report.status === "new" ? <div className="mt-4 flex gap-2 border-t pt-3"><ActionButton run={resolvePublicCorrection.bind(null, report.id, "reviewed")}>Mark reviewed</ActionButton><ActionButton run={resolvePublicCorrection.bind(null, report.id, "dismissed")} variant="ghost">Dismiss</ActionButton></div> : null}
          </article>
        ))}
        {data.schemaAvailable && data.corrections.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No public correction reports.</p> : null}
      </section>
    </div>
  );
}
