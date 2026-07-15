import type { Store } from "@/lib/data";
import type {
  GiftCardAcceptanceEvidenceType,
  GiftCardAcceptanceRow,
} from "@/lib/offers/types";
import { normaliseText } from "@/lib/sources/normalise";
import {
  resolveMerchantAlias,
  type MerchantAliasResolution,
} from "./resolveMerchantAlias";

export interface MerchantListSnapshot {
  content: string;
  contentType: "html" | "text";
  productId: string;
  sourceId: string | null;
  evidenceUrl: string;
  capturedAt: string;
  evidenceSourceType: GiftCardAcceptanceEvidenceType;
  /** Only a reviewed complete list is allowed to imply removals. */
  completeSnapshot?: boolean;
}

export interface ParsedMerchantEntry {
  rawMerchantName: string;
  acceptsOnline: boolean | null;
  acceptsInStore: boolean | null;
  acceptsApp: boolean | null;
  acceptsPhone: boolean | null;
  limitations: string | null;
}

export type AcceptanceCandidateChangeKind = "new" | "changed" | "removed";

export interface AcceptanceCandidateDraft {
  rawMerchantName: string;
  sourceId: string | null;
  proposedProductId: string;
  resolvedStoreId: string | null;
  resolutionState: MerchantAliasResolution["state"];
  changeKind: AcceptanceCandidateChangeKind;
  linkedAcceptanceId: string | null;
  proposedValues: Record<string, unknown>;
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

function textLines(snapshot: MerchantListSnapshot): string[] {
  const text =
    snapshot.contentType === "html"
      ? snapshot.content
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
          .replace(/<\/(?:li|tr|p|div|option|h[1-6])\s*>/gi, "\n")
          .replace(/<br\s*\/?\s*>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
      : snapshot.content;
  return decodeEntities(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

function statedChannel(line: string, channel: RegExp): boolean | null {
  const match = channel.exec(line);
  if (!match || match.index == null) return null;
  const prefix = line.slice(Math.max(0, match.index - 32), match.index).trim();
  return /\b(?:not|no|excluding|except)(?:\s+accepted)?\s*$/i.test(prefix)
    ? false
    : true;
}

/** Parse only what the captured line explicitly states; unknown stays null. */
export function parseMerchantList(
  snapshot: MerchantListSnapshot,
): ParsedMerchantEntry[] {
  const seen = new Set<string>();
  return textLines(snapshot).flatMap((line) => {
    const parts = line.split(/\s+(?:—|–|\|)\s+|\s+-\s+/);
    const narrative = line.match(
      /^(?:buy items from|use at)\s+(.+?)\s+(?=(?:in[ -]?store|online|over the phone)\b)/i,
    );
    const rawMerchantName = (narrative?.[1] ?? parts[0])?.trim();
    if (!rawMerchantName || rawMerchantName.length > 160) return [];
    const key = normaliseText(rawMerchantName);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    const limitations = narrative
      ? line.slice(narrative[0].length).trim() || null
      : parts.slice(1).join(" — ").trim() || null;
    return [{
      rawMerchantName,
      acceptsOnline: statedChannel(line, /\bonline\b/i),
      acceptsInStore: statedChannel(line, /\b(?:in[ -]?store|stores?)\b/i),
      acceptsApp: statedChannel(line, /\bapp\b/i),
      acceptsPhone: statedChannel(line, /\bphone\b/i),
      limitations,
    }];
  });
}

function relationshipKey(
  productId: string,
  storeId: string | null,
  merchantName: string | null,
): string {
  return `${productId}:${storeId ?? `raw:${normaliseText(merchantName ?? "")}`}`;
}

export function buildAcceptanceCandidateDrafts(
  snapshot: MerchantListSnapshot,
  entries: ParsedMerchantEntry[],
  stores: Array<Pick<Store, "id" | "name" | "aliases">>,
  current: GiftCardAcceptanceRow[],
): AcceptanceCandidateDraft[] {
  const existing = new Map(
    current
      .filter((row) => row.productId === snapshot.productId)
      .map((row) => [
        relationshipKey(row.productId, row.storeId, row.merchantName),
        row,
      ]),
  );
  const seen = new Set<string>();
  const drafts: AcceptanceCandidateDraft[] = entries.map((entry) => {
    const resolution = resolveMerchantAlias(entry.rawMerchantName, stores);
    const key = relationshipKey(
      snapshot.productId,
      resolution.storeId,
      entry.rawMerchantName,
    );
    seen.add(key);
    const previous = existing.get(key) ?? null;
    const proposedValues: Record<string, unknown> = {
      product_id: snapshot.productId,
      store_id: resolution.storeId,
      merchant_name: entry.rawMerchantName,
      accepts_online: entry.acceptsOnline,
      accepts_in_store: entry.acceptsInStore,
      accepts_app: entry.acceptsApp,
      accepts_phone: entry.acceptsPhone,
      limitations: entry.limitations,
      acceptance_status:
        snapshot.evidenceSourceType === "issuer-official" ||
        snapshot.evidenceSourceType === "merchant-official" ||
        snapshot.evidenceSourceType === "terms"
          ? "confirmed-accepted"
          : snapshot.evidenceSourceType === "gcdb" ||
              snapshot.evidenceSourceType === "specialist"
            ? "likely-accepted"
            : "unofficially-reported",
      evidence_source_type: snapshot.evidenceSourceType,
      evidence_url: snapshot.evidenceUrl,
      evidence_captured_at: snapshot.capturedAt,
      last_checked_at: snapshot.capturedAt,
      region: "AU",
    };
    return {
      rawMerchantName: entry.rawMerchantName,
      sourceId: snapshot.sourceId,
      proposedProductId: snapshot.productId,
      resolvedStoreId: resolution.storeId,
      resolutionState: resolution.state,
      changeKind: previous ? "changed" : "new",
      linkedAcceptanceId: previous?.id ?? null,
      proposedValues,
    };
  });

  if (!snapshot.completeSnapshot) return drafts;
  for (const [key, row] of existing) {
    if (seen.has(key)) continue;
    drafts.push({
      rawMerchantName: row.merchantName ?? row.storeId ?? "Unresolved merchant",
      sourceId: snapshot.sourceId,
      proposedProductId: snapshot.productId,
      resolvedStoreId: row.storeId,
      resolutionState: row.storeId ? "resolved" : "unresolved",
      changeKind: "removed",
      linkedAcceptanceId: row.id,
      proposedValues: {
        evidence_source_type: snapshot.evidenceSourceType,
        evidence_url: snapshot.evidenceUrl,
        evidence_captured_at: snapshot.capturedAt,
        last_checked_at: snapshot.capturedAt,
      },
    });
  }
  return drafts;
}
