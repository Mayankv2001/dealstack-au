import { safePublicHref } from "@/lib/security/urlPolicy";
import { SOURCE_META, type Citation, type SourceId } from "@/lib/sources/types";

/**
 * Source-citation de-duplication for display.
 *
 * A stack draws citations from every matching offer and every corroborating
 * OzBargain signal, so the same source (especially "OzBargain") appears many
 * times — once per node URL. Rendering all of them produces the dozens of
 * repeated badges the Best stacks view suffered from.
 *
 * This collapses citations to a compact, honest summary WITHOUT losing
 * traceability:
 *   - `total`     : distinct citations, deduped by source + normalised URL.
 *   - `providers` : one entry per distinct source (OzBargain, GCDB, …), ranked
 *                   by trust weight, each carrying how many distinct records it
 *                   contributed and a representative link.
 *   - `all`       : every distinct safe citation, for the expandable disclosure.
 *
 * Pure and framework-free so it is unit-testable and shared by server cards.
 */

export interface CitationProvider {
  source: SourceId;
  displayName: string;
  publisherFamily: string;
  /** Distinct records this source contributed (deduped by normalised URL). */
  count: number;
  /** Meaningful public evidence links contributed by this provider. */
  evidenceLinkCount: number;
  /** A single safe, linkable URL when the source has exactly one; else null. */
  href: string | null;
}

export interface CitationEntry {
  source: SourceId;
  displayName: string;
  /** Safe href (external HTTPS or app-local); null when the URL is a placeholder. */
  href: string | null;
  /** The raw source URL, retained for keys/traceability even when not linkable. */
  sourceUrl: string;
}

export interface CitationSummary {
  /** Distinct source+URL citations checked for this stack. */
  total: number;
  /** Linkable public evidence destinations (internal record entries excluded). */
  linkCount: number;
  /** Every distinct source provider, strongest trust first. */
  providers: CitationProvider[];
  /** Independent editorial families represented by the provider links. */
  publisherFamilyCount: number;
  /** The first `visibleLimit` providers — the only badges a collapsed card shows. */
  visibleProviders: CitationProvider[];
  /** Providers beyond the visible limit (rendered as a "+N" affordance). */
  hiddenProviderCount: number;
  /** Full, distinct citation list for the accessible disclosure. */
  all: CitationEntry[];
}

/** Default number of source badges a collapsed card may show. */
export const MAX_VISIBLE_SOURCES = 3;

/**
 * Normalise a URL for dedupe: lowercase host, drop a trailing slash, drop query
 * and hash. Non-URL / app-local values are lower-cased verbatim. This is a
 * dedupe key only — never a navigation target.
 */
function normaliseUrlKey(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Build the display summary for a stack's citations.
 *
 * @param citations   raw citations from the stack recommendation
 * @param visibleLimit how many source badges a collapsed card may show
 */
export function summariseCitations(
  citations: Citation[],
  visibleLimit: number = MAX_VISIBLE_SOURCES,
): CitationSummary {
  // 1 ── Dedupe by source + normalised URL (traceability preserved). ─────────
  const seen = new Set<string>();
  const distinct: CitationEntry[] = [];
  for (const c of citations) {
    const key = `${c.source}|${normaliseUrlKey(c.sourceUrl)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const candidateHref = safePublicHref(c.sourceUrl);
    const href =
      c.source === "manual" && candidateHref?.startsWith("/")
        ? null
        : candidateHref;
    distinct.push({
      source: c.source,
      displayName: SOURCE_META[c.source]?.displayName ?? c.source,
      href,
      sourceUrl: c.sourceUrl,
    });
  }

  // 2 ── Group into providers, strongest trust first, then most corroboration.
  const bySource = new Map<SourceId, CitationEntry[]>();
  for (const entry of distinct) {
    const list = bySource.get(entry.source) ?? [];
    list.push(entry);
    bySource.set(entry.source, list);
  }

  const providers: CitationProvider[] = [...bySource.entries()]
    .map(([source, entries]) => ({
      source,
      displayName: SOURCE_META[source]?.displayName ?? source,
      publisherFamily:
        SOURCE_META[source]?.publisherFamily ?? `source:${source}`,
      count: entries.length,
      evidenceLinkCount: entries.filter((entry) => entry.href !== null).length,
      // Link only when the source contributed exactly one distinct, safe URL —
      // otherwise the badge would imply a single canonical destination it lacks.
      href: entries.length === 1 && entries[0].href ? entries[0].href : null,
    }))
    .sort((a, b) => {
      const trust =
        (SOURCE_META[b.source]?.trustWeight ?? 0) -
        (SOURCE_META[a.source]?.trustWeight ?? 0);
      if (trust !== 0) return trust;
      if (b.count !== a.count) return b.count - a.count;
      return a.displayName.localeCompare(b.displayName);
    });

  const visibleProviders = providers.slice(0, Math.max(0, visibleLimit));

  return {
    total: distinct.length,
    linkCount: distinct.filter((entry) => entry.href !== null).length,
    providers,
    publisherFamilyCount: new Set(
      distinct
        .filter((entry) => entry.href !== null)
        .map(
          (entry) =>
            SOURCE_META[entry.source]?.publisherFamily ??
            `source:${entry.source}`,
        )
        .filter((family) => family !== "dealstack"),
    ).size,
    visibleProviders,
    hiddenProviderCount: Math.max(
      0,
      providers.length - visibleProviders.length,
    ),
    all: distinct,
  };
}

/**
 * Compact one-line label, e.g. "DealStack, GCDB, OzBargain +2".
 * `+N` counts source PROVIDERS beyond the visible set, not individual records.
 */
export function providerSummaryLabel(summary: CitationSummary): string {
  const names = summary.visibleProviders.map((p) => p.displayName);
  const suffix =
    summary.hiddenProviderCount > 0 ? ` +${summary.hiddenProviderCount}` : "";
  return `${names.join(", ")}${suffix}`;
}
