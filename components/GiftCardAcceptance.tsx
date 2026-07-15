"use client";

import { useState } from "react";
import { ChevronDown, Search, Store as StoreIcon } from "lucide-react";
import type { GiftCardAcceptanceRow } from "@/lib/offers/types";
import {
  canonicalAcceptanceStatus,
  type ProductAcceptanceView,
} from "@/lib/giftcards/acceptanceModel";
import { acceptancePublicView } from "@/lib/giftcards/acceptanceViewModel";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * "Where each card works" — one collapsible panel per included product with
 * merchant search over long lists, category chips, supported/unsupported MCC
 * detail and per-row acceptance confidence. Acceptance is never presented as
 * guaranteed (MCC_DISCLAIMER accompanies every panel).
 */

const SEARCH_THRESHOLD = 8;

function merchantLabel(
  row: GiftCardAcceptanceRow,
  storeNames: Record<string, string>
): string {
  return (
    row.merchantName ??
    (row.storeId ? (storeNames[row.storeId] ?? row.storeId) : "Unnamed merchant")
  );
}

function StatusPill({
  row,
  label,
}: {
  row: GiftCardAcceptanceRow;
  label: string;
}) {
  const status = canonicalAcceptanceStatus(row);
  const className =
    status === "confirmed-accepted"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "likely-accepted"
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
        : status === "confirmed-not-accepted"
          ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function MccList({ label, mccs }: { label: string; mccs: number[] }) {
  if (mccs.length === 0) return null;
  return (
    <div className="text-xs">
      <span className="font-medium">{label}:</span>{" "}
      <span className="text-muted-foreground">{mccs.join(", ")}</span>
    </div>
  );
}

function ProductPanel({
  view,
  storeNames,
  defaultOpen,
  now,
}: {
  view: ProductAcceptanceView;
  storeNames: Record<string, string>;
  defaultOpen: boolean;
  now: Date;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? view.merchants.filter((row) =>
        `${merchantLabel(row, storeNames)} ${row.merchantCategory ?? ""}`
          .toLowerCase()
          .includes(needle)
      )
    : view.merchants;
  const hasMccData =
    view.supportedMccs.length > 0 || view.unsupportedMccs.length > 0;

  return (
    <details
      id={`product-${view.productId}`}
      open={defaultOpen}
      className="group rounded-xl border bg-background"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <StoreIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{view.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {view.merchants.length > 0
            ? `${view.merchants.length} merchant${view.merchants.length === 1 ? "" : "s"}`
            : "No merchant evidence yet"}
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="space-y-3 border-t p-3">
        {view.product ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {view.product.issuer ? <span>Issuer: {view.product.issuer}</span> : null}
            {view.product.cardNetwork && view.product.cardNetwork !== "unknown" ? (
              <span>Network: {view.product.cardNetwork}</span>
            ) : null}
            {view.product.format !== "unknown" ? (
              <span>Format: {view.product.format.replace(/-/g, " ")}</span>
            ) : null}
            {view.product.mobileWallet !== "unknown" ? (
              <span>Mobile wallet: {view.product.mobileWallet}</span>
            ) : null}
            {view.product.categoryRestricted ? (
              <span className="text-amber-700 dark:text-amber-400">
                Category-restricted card
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Product details not yet recorded for this card.
          </p>
        )}

        {view.categories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {view.categories.map((category) => (
              <span
                key={category}
                className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
              >
                {category}
              </span>
            ))}
          </div>
        ) : null}

        {view.merchants.length > SEARCH_THRESHOLD ? (
          <label className="flex items-center gap-2 rounded-md border bg-background px-2">
            <Search aria-hidden className="size-3.5 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${view.merchants.length} merchants…`}
              className="h-8 w-full bg-transparent text-sm outline-none"
            />
          </label>
        ) : null}

        {view.merchants.length > 0 ? (
          filtered.length > 0 ? (
            <ul className="divide-y">
              {filtered.map((row) => {
                const publicView = acceptancePublicView(row, now);
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">
                        {merchantLabel(row, storeNames)}
                      </span>
                      <StatusPill row={row} label={publicView.statusLabel} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        row.merchantCategory,
                        row.mcc != null ? `MCC ${row.mcc}` : null,
                        (row.lastCheckedAt ?? row.checkedAt)
                          ? `checked ${formatDateAU((row.lastCheckedAt ?? row.checkedAt)!.slice(0, 10))}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <div className="basis-full text-xs text-muted-foreground">
                      <span>{publicView.evidenceLabel}</span>
                      <span className={publicView.freshnessLabel.startsWith("Stale") ? "ml-2 font-semibold text-amber-700 dark:text-amber-400" : "ml-2"}>
                        {publicView.freshnessLabel}
                      </span>
                      <span className="ml-2">{publicView.channelsLabel}</span>
                      {publicView.limitationsLabel ? (
                        <span className="ml-2">{publicView.limitationsLabel}</span>
                      ) : null}
                      <span className="ml-2">{publicView.checkedLabel}</span>
                      {publicView.evidenceUrl ? (
                        <a
                          href={publicView.evidenceUrl}
                          target="_blank"
                          rel="nofollow noopener noreferrer"
                          className="ml-2 font-semibold text-emerald-700 hover:underline"
                        >
                          Evidence
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No merchants match “{query}”.
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            No published merchant-acceptance evidence for this card yet — check
            the retailer before buying.
          </p>
        )}

        {view.rejectedMerchants.length > 0 ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-2">
            <p className="text-xs font-medium">Known not to work</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {view.rejectedMerchants.map((row) => (
                <li key={row.id}>
                  {merchantLabel(row, storeNames)}
                  {row.mcc != null ? ` (MCC ${row.mcc})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {hasMccData ? (
          <details className="rounded-lg border bg-muted/40 p-2">
            <summary className="cursor-pointer text-xs font-medium">
              Merchant category code (MCC) detail
            </summary>
            <div className="mt-2 space-y-1">
              <MccList label="Supported MCCs" mccs={view.supportedMccs} />
              <MccList label="Unsupported MCCs" mccs={view.unsupportedMccs} />
            </div>
          </details>
        ) : (
          <p className="text-xs text-muted-foreground">
            Merchant category code (MCC) support has not been verified for this
            card.
          </p>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          {view.merchants.some((row) => row.mcc != null)
            ? acceptancePublicView(
                view.merchants.find((row) => row.mcc != null)!,
                now,
              ).mccDisclaimer
            : "Acceptance evidence can change. Verify before purchase."}
          {view.lastCheckedAt
            ? ` Acceptance evidence last checked ${formatDateAU(view.lastCheckedAt.slice(0, 10))}.`
            : ""}
        </p>
      </div>
    </details>
  );
}

export default function GiftCardAcceptance({
  views,
  storeNames,
  nowIso,
}: {
  views: ProductAcceptanceView[];
  storeNames: Record<string, string>;
  nowIso: string;
}) {
  if (views.length === 0) return null;
  return (
    <div className="space-y-3">
      {views.map((view, index) => (
        <ProductPanel
          key={view.productId}
          view={view}
          storeNames={storeNames}
          defaultOpen={index === 0}
          now={new Date(nowIso)}
        />
      ))}
    </div>
  );
}
