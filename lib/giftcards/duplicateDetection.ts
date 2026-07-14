/**
 * Duplicate detection between a staged gift-card candidate and the ALREADY
 * PUBLISHED offers — the layer the ingest's own idempotency cannot cover
 * (raw items dedupe by (source_id, external_id); this dedupes across source
 * pages and against manually created offers).
 *
 * Verdicts, most severe first:
 *   exact-duplicate      — same canonical source URL: the same source page.
 *   probable-duplicate   — same seller + overlapping cards + same promotion
 *                          type and value, dates equal or unrecorded.
 *   overlapping-campaign — same seller and cards but the value, dates or
 *                          promotion type differ: likely a changed, renewed
 *                          or superseding campaign that needs a human call.
 *
 * Pure and deterministic. NOTHING here rejects anything — the verdicts are
 * surfaced on the review card and the admin decides.
 */

export interface DedupCandidate {
  sellerName: string | null;
  giftCardBrands: string[];
  promotionType: string;
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  fixedPoints: number | null;
  pointsProgram: string | null;
  denominationNote: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  sourceUrl: string | null;
}

export interface PublishedOfferSummary {
  id: string;
  /** Comma-joined brand list as stored on the offer row. */
  brand: string;
  seller: string | null;
  promotionType: string;
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  fixedPoints: number | null;
  pointsProgram: string | null;
  denominationNote: string | null;
  startDate: string | null;
  expiryDate: string | null;
  sourceDetailUrl: string | null;
}

export type DuplicateVerdict =
  | "exact-duplicate"
  | "probable-duplicate"
  | "overlapping-campaign";

export interface DuplicateMatch {
  offer: PublishedOfferSummary;
  verdict: DuplicateVerdict;
  reasons: string[];
}

export const DUPLICATE_VERDICT_LABEL: Record<DuplicateVerdict, string> = {
  "exact-duplicate": "Exact duplicate",
  "probable-duplicate": "Probable duplicate",
  "overlapping-campaign": "Overlapping campaign",
};

const SEVERITY: Record<DuplicateVerdict, number> = {
  "exact-duplicate": 0,
  "probable-duplicate": 1,
  "overlapping-campaign": 2,
};

/** Canonical form for source-URL equality: host lowercased, no query/hash/trailing slash. */
export function canonicalSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, "");
    // A homepage/category page is evidence-poor and shared by unrelated rows;
    // treating it as an exact identity created false duplicate warnings for the
    // four legacy rows that all cite gcdb.com.au.
    if (!path || path === "/") return null;
    return `${parsed.hostname.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return null;
  }
}

const norm = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

/** "Woolworths" matches "Woolworths supermarkets" (containment either way). */
function sellersMatch(a: string | null, b: string | null): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function brandsOverlap(candidateBrands: string[], offerBrand: string): string[] {
  const offerBrands = offerBrand.split(",").map(norm).filter(Boolean);
  return candidateBrands.filter((brand) => {
    const nb = norm(brand);
    return offerBrands.some((ob) => ob === nb || ob.includes(nb) || nb.includes(ob));
  });
}

function valuesMatch(c: DedupCandidate, o: PublishedOfferSummary): boolean {
  if ((c.discountPercent ?? 0) > 0 || (o.discountPercent ?? 0) > 0) {
    return c.discountPercent != null && c.discountPercent === o.discountPercent;
  }
  if ((c.pointsMultiplier ?? 0) > 0 || (o.pointsMultiplier ?? 0) > 0) {
    return (
      c.pointsMultiplier != null &&
      c.pointsMultiplier === o.pointsMultiplier &&
      (norm(c.pointsProgram) === norm(o.pointsProgram) ||
        !c.pointsProgram ||
        !o.pointsProgram)
    );
  }
  if ((c.fixedPoints ?? 0) > 0 || (o.fixedPoints ?? 0) > 0) {
    return (
      c.fixedPoints != null &&
      c.fixedPoints === o.fixedPoints &&
      (norm(c.pointsProgram) === norm(o.pointsProgram) ||
        !c.pointsProgram ||
        !o.pointsProgram)
    );
  }
  if ((c.bonusPercent ?? 0) > 0 || (o.bonusPercent ?? 0) > 0) {
    return c.bonusPercent != null && c.bonusPercent === o.bonusPercent;
  }
  return false;
}

function denominationsMatch(c: DedupCandidate, o: PublishedOfferSummary): boolean {
  const candidate = norm(c.denominationNote).replace(/\s+/g, " ");
  const published = norm(o.denominationNote).replace(/\s+/g, " ");
  return !candidate || !published || candidate === published;
}

function datesMatch(c: DedupCandidate, o: PublishedOfferSummary): boolean {
  const start = !c.startsAt || !o.startDate || c.startsAt === o.startDate;
  const end = !c.expiresAt || !o.expiryDate || c.expiresAt === o.expiryDate;
  return start && end;
}

export function findDuplicateOffers(
  candidate: DedupCandidate,
  offers: PublishedOfferSummary[],
  /** YYYY-MM-DD used to recognise supersession of already-expired offers. */
  today?: string
): DuplicateMatch[] {
  const candidateUrl = canonicalSourceUrl(candidate.sourceUrl);
  const matches: DuplicateMatch[] = [];

  for (const offer of offers) {
    const reasons: string[] = [];

    // 1. Same canonical source page → exact duplicate, regardless of fields.
    const offerUrl = canonicalSourceUrl(offer.sourceDetailUrl);
    if (candidateUrl && offerUrl && candidateUrl === offerUrl) {
      matches.push({
        offer,
        verdict: "exact-duplicate",
        reasons: ["Same canonical source URL as the published offer."],
      });
      continue;
    }

    // 2. Field-level comparison needs at least seller + card overlap.
    if (!sellersMatch(candidate.sellerName, offer.seller)) continue;
    const overlap = brandsOverlap(candidate.giftCardBrands, offer.brand);
    if (overlap.length === 0) continue;
    reasons.push(
      `Same seller and overlapping cards (${overlap.slice(0, 3).join(", ")}${overlap.length > 3 ? "…" : ""}).`
    );

    const sameType = norm(candidate.promotionType) === norm(offer.promotionType);
    const sameValue = valuesMatch(candidate, offer);
    const sameDates = datesMatch(candidate, offer);
    const sameDenominations = denominationsMatch(candidate, offer);
    const offerExpired = Boolean(
      today && offer.expiryDate && offer.expiryDate < today
    );

    if (offerExpired) {
      reasons.push(
        `The published offer expired on ${offer.expiryDate} — this candidate likely supersedes it.`
      );
      matches.push({ offer, verdict: "overlapping-campaign", reasons });
      continue;
    }

    if (sameType && sameValue) {
      if (sameDates && sameDenominations) {
        reasons.push("Same promotion type, value, dates and recorded denominations.");
        matches.push({ offer, verdict: "probable-duplicate", reasons });
      } else if (!sameDenominations) {
        reasons.push("Same mechanic and value but the recorded denominations differ.");
        matches.push({ offer, verdict: "overlapping-campaign", reasons });
      } else {
        reasons.push(
          "Same promotion type and value but the dates changed — likely a renewed campaign."
        );
        matches.push({ offer, verdict: "overlapping-campaign", reasons });
      }
      continue;
    }

    if (sameType) {
      reasons.push("Same promotion type with a different value.");
    } else {
      reasons.push(
        "Different promotion type — check whether the published offer was typed correctly."
      );
    }
    matches.push({ offer, verdict: "overlapping-campaign", reasons });
  }

  return matches.sort((a, b) => SEVERITY[a.verdict] - SEVERITY[b.verdict]);
}
