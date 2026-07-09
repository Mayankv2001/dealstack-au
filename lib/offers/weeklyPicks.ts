import type { WeeklyDealCardData, WeeklyDealTone } from "@/components/WeeklyDealCard";
import type { Citation, DealKind } from "@/lib/sources/types";
import { isExpiringSoonAU } from "./expiry";
import type {
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
  WeeklyDeal,
  WeeklyHighlight,
} from "./types";

/**
 * Pure mapper: admin-curated WeeklyDeal rows -> WeeklyDealCardData for the
 * "This week's picks" section on /deals. No React/lucide imports — plain data
 * in, plain data out, so tests cover it without a DOM.
 *
 * componentIds are resolved against the already-loaded offer bundles (the
 * same pools the rest of /deals uses) so each pick shows the layers it
 * stacks. Mixed-source resolution is expected (weekly_deals can come from the
 * DB while an offer table fell back to static, or vice versa) — unresolved
 * ids are dropped silently, never rendered as a broken reference and never
 * thrown on.
 */

export interface WeeklyPickLookups {
  giftCards: GiftCardOffer[];
  cashback: CashbackOffer[];
  points: PointsOffer[];
  signals: OzBargainSignal[];
  storeNameById: (id: string | null) => string | null;
}

/** One curated card, keyed by the deal id (titles can repeat across weeks). */
export interface WeeklyPickCard {
  id: string;
  data: WeeklyDealCardData;
}

const MAX_PICKS = 6;

/** kind/tone for the default-variant icon + accent, by highlight. There is no
 * "signal" DealKind — it maps to "guide" (the neutral Store icon). */
export function highlightMeta(
  h: WeeklyHighlight
): { kind: DealKind; tone: WeeklyDealTone } {
  switch (h) {
    case "best-stack":
      return { kind: "guide", tone: "emerald" };
    case "gift-card":
      return { kind: "gift-card", tone: "violet" };
    case "points":
      return { kind: "points", tone: "amber" };
    case "cashback":
      return { kind: "cashback", tone: "rose" };
    case "signal":
      return { kind: "guide", tone: "orange" };
    case "needs-verification":
      return { kind: "guide", tone: "sky" };
  }
}

/** Resolve componentIds to human labels against the gift-card/cashback/points
 * pools, by id. Signal ids never become labels (see resolveSignalCitations) —
 * their titles are too long for the highlight strip. Unknown ids are skipped
 * silently — no error, no placeholder. */
export function resolveComponentLabels(
  componentIds: string[],
  lookups: Pick<WeeklyPickLookups, "giftCards" | "cashback" | "points">
): string[] {
  const labels: string[] = [];
  for (const id of componentIds) {
    const giftCard = lookups.giftCards.find((g) => g.id === id);
    if (giftCard) {
      labels.push(
        giftCard.discountPercent === 0
          ? `${giftCard.brand} gift card bonus`
          : `${giftCard.discountPercent}% off ${giftCard.brand} gift cards`
      );
      continue;
    }
    const cashback = lookups.cashback.find((c) => c.id === id);
    if (cashback) {
      labels.push(`${cashback.ratePercent}% ${cashback.provider} cashback`);
      continue;
    }
    const points = lookups.points.find((p) => p.id === id);
    if (points) {
      const rate = points.earnRateDisplay || `${points.earnMultiple}x`;
      labels.push(`${rate} (${points.program})`);
    }
    // Unmatched (unknown id, or a signal id — handled separately): skipped.
  }
  return labels;
}

/** Signal components contribute a citation, never a label — but only when the
 * signal is not a sample (sample sourceUrls are placeholders that must never
 * render as live links, same rule signalToResult applies). */
function resolveSignalCitations(
  componentIds: string[],
  signals: OzBargainSignal[]
): Citation[] {
  const citations: Citation[] = [];
  for (const id of componentIds) {
    const signal = signals.find((s) => s.id === id);
    if (signal && !signal.isSample) {
      citations.push({ source: "ozbargain", sourceUrl: signal.sourceUrl });
    }
  }
  return citations;
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    const key = `${c.source}|${c.sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Map one WeeklyDeal to WeeklyDealCardData (default variant). */
export function buildWeeklyPickCard(
  deal: WeeklyDeal,
  lookups: WeeklyPickLookups,
  now: Date = new Date()
): WeeklyDealCardData {
  const { kind, tone } = highlightMeta(deal.highlight);
  const labels = resolveComponentLabels(deal.componentIds, lookups);
  const signalCitations = resolveSignalCitations(deal.componentIds, lookups.signals);

  return {
    variant: "default",
    category: "This week's pick",
    kind,
    tone,
    title: deal.title,
    summary: deal.summary,
    subject: lookups.storeNameById(deal.merchantId),
    highlight: labels.length > 0 ? labels.join(" + ") : undefined,
    confidence: deal.confidence,
    expiryDate: deal.expiryDate,
    expiringSoon: isExpiringSoonAU(deal.expiryDate, now),
    lastCheckedAt: null, // weekly_deals has no such column
    citations: dedupeCitations([...deal.citations, ...signalCitations]),
  };
}

/** Build curated pick cards: sorted weekOf desc, then title asc, capped at 6. */
export function buildWeeklyPickCards(
  deals: WeeklyDeal[],
  lookups: WeeklyPickLookups,
  now: Date = new Date()
): WeeklyPickCard[] {
  return [...deals]
    .sort((a, b) => {
      const weekCmp = b.weekOf.localeCompare(a.weekOf);
      return weekCmp !== 0 ? weekCmp : a.title.localeCompare(b.title);
    })
    .slice(0, MAX_PICKS)
    .map((deal) => ({ id: deal.id, data: buildWeeklyPickCard(deal, lookups, now) }));
}
