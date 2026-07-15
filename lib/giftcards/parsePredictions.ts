/**
 * GCDB gift-card offer-predictions parser (TASK-06) — pure, no I/O.
 *
 * Parses a captured HTML snapshot of https://gcdb.com.au/predictions/ into
 * ParsedPrediction records. Predictions are an editorial FORECAST record type,
 * never a live offer: this module only extracts facts; nothing here writes to
 * gift_card_offers or any public surface (see giftCardPredictions.ts + the
 * isolation tests).
 *
 * OUTCOME MARKERS — the page renders a ✅ or ❌ emoji (`<img class="emoji"
 * alt="…">`) beside some predictions but provides NO legend explaining them.
 * Per TASK-06 and the programme truth rules we therefore make NO interpretation:
 * the raw marker is preserved verbatim in `rawMarker` (surfaced to admins via
 * comparison_notes) and `status` stays "predicted". A documented interpretation
 * table would only be added here if GCDB published an explicit legend.
 *
 * The parser mirrors the repository's dependency-free HTML approach (regex /
 * matchAll, as in pointHacksWeekly.ts) and reuses parseGcdbFeed helpers.
 */

import { createHash } from "node:crypto";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { canonicaliseUrl, parseAuDate } from "./parseGcdbFeed";

export const GCDB_PREDICTIONS_SOURCE_ID = "gcdb_predictions";
export const GCDB_PREDICTIONS_URL = "https://gcdb.com.au/predictions/";
export const GCDB_PREDICTIONS_PARSER_VERSION = 1;

/** Mechanic inferred from the free-text prediction. `none` = "No promotion". */
export type PredictedPromotionType =
  | "points"
  | "fixed-points"
  | "discount"
  | "bonus-value"
  | "fixed-dollar-discount"
  | "fee-waiver"
  | "none"
  | "unknown";

export interface ParsedPrediction {
  predictedSeller: string;
  /** Verbatim promotion text (canonical; every derived field is best-effort). */
  predictedPromotionText: string;
  predictedPromotionType: PredictedPromotionType;
  /** Best-effort gift-card family list; [] when the text can't be parsed cleanly. */
  predictedFamilies: string[];
  /** Short headline value token (e.g. "20x points", "$13 off"); null for none. */
  predictedValue: string | null;
  /** Percentage only for `discount`/`bonus-value`; null otherwise. */
  predictedDiscountPercent: number | null;
  predictedStartsAt: string | null;
  predictedEndsAt: string | null;
  /** GCDB per-row reference link (a past confirmed occurrence), if any. */
  refUrl: string | null;
  /** Raw ✅/❌ marker text, preserved uninterpreted; null when absent. */
  rawMarker: string | null;
  /** Stable identity: normalised seller + sorted/deduplicated families + window. */
  fingerprint: string;
}

export interface ParsedPredictionsPage {
  sourceUrl: string;
  sourceLastUpdated: string | null;
  predictions: ParsedPrediction[];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Australian numeric date `D/M/YYYY` → ISO `YYYY-MM-DD`, else null. */
export function parseSlashDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function classifyPromotionType(text: string): PredictedPromotionType {
  const t = text.toLowerCase();
  if (/\bno promotion\b/.test(t)) return "none";
  if (/purchase fees|fee waiver|\$0\s+.*fee/.test(t)) return "fee-waiver";
  if (/\bbonus\s+\d+%/.test(t)) return "bonus-value";
  if (/\$\d[\d,]*\s+off/.test(t)) return "fixed-dollar-discount";
  if (/\d+%\s*off/.test(t)) return "discount";
  if (/\d+x\s+points/.test(t)) return "points";
  if (/\d[\d,]*\s+points\b/.test(t)) return "fixed-points";
  if (/\bbonus points\b/.test(t)) return "points";
  return "unknown";
}

function extractValueToken(text: string): string | null {
  const m = text.match(
    /(bonus\s+\d+%|\$\d[\d,]*\s+off|\$0\s+purchase fees|\d+%\s*off|\d+x\s+points|\d[\d,]*\s+points)/i
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function extractDiscountPercent(
  type: PredictedPromotionType,
  text: string
): number | null {
  if (type !== "discount" && type !== "bonus-value") return null;
  const m = text.match(/(\d+)\s*%/);
  return m ? Number(m[1]) : null;
}

/**
 * Best-effort family list from "… on|off <families> gift cards …". The verbatim
 * promotion text remains canonical; this returns [] when it can't parse cleanly.
 */
export function extractFamilies(text: string): string[] {
  const m = text.match(/\b(?:on|off)\s+(.+?)\s+gift cards\b/i);
  if (!m) return [];
  return m[1]
    .split(/,|\band\b/i)
    .map((token) => token.replace(/^\s*\$\d[\d,]*\s+/, "").trim())
    .filter(
      (token) =>
        token.length > 0 &&
        !/^\$?\d[\d,]*$/.test(token) &&
        !/^selected\b/i.test(token)
    );
}

/**
 * Keep this normalisation byte-for-byte aligned with migration 029's
 * `normalise_gift_card_prediction_identity_text` SQL function. Record/field
 * separators are removed before hashing so source text cannot create an
 * ambiguous canonical identity string.
 */
export function normalisePredictionIdentityText(value: string): string {
  return value
    .replace(/[\x1e\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalisePredictionFamilies(families: string[]): string[] {
  return [...new Set(families.map(normalisePredictionIdentityText).filter(Boolean))]
    .sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
}

export function buildPredictionFingerprint(
  seller: string,
  families: string[],
  startsAt: string | null,
  endsAt: string | null
): string {
  const canonical = [
    normalisePredictionIdentityText(seller),
    normalisePredictionFamilies(families).join("\x1e"),
    startsAt ?? "",
    endsAt ?? "",
  ].join("\x1f");
  return createHash("md5").update(canonical, "utf8").digest("hex");
}

function cellHtmls(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
}

function extractMarker(promoCellHtml: string): string | null {
  const alts = [...promoCellHtml.matchAll(/<img[^>]*\balt="([^"]*)"/gi)]
    .map((m) => m[1].trim())
    .filter((alt) => alt.length > 0);
  return alts.length ? alts.join(" ") : null;
}

function extractRefUrl(refCellHtml: string): string | null {
  const href = refCellHtml.match(/<a[^>]*\bhref="([^"]+)"/i)?.[1];
  const canonical = href ? canonicaliseUrl(href) : null;
  return canonical ? safeHttpsUrl(canonical) : null;
}

/**
 * Parse the predictions page. `html` is a captured snapshot; `sourceUrl`
 * defaults to the canonical predictions page URL.
 */
export function parseGcdbPredictions(
  html: string,
  sourceUrl: string = GCDB_PREDICTIONS_URL
): ParsedPredictionsPage {
  const updatedRaw = html.match(/last updated\s+([^.<]+)/i)?.[1] ?? null;
  const sourceLastUpdated = parseAuDate(updatedRaw);

  const predictions: ParsedPrediction[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    if (!/<td[\s>]/i.test(rowHtml)) continue; // skip the <th> header row
    const cells = cellHtmls(rowHtml);
    if (cells.length < 4) continue;

    const seller = stripTags(cells[0]);
    const promoCellHtml = cells[1];
    const promotionText = stripTags(promoCellHtml);
    if (!seller || !promotionText) continue;

    const predictedStartsAt = parseSlashDate(stripTags(cells[2]));
    const predictedEndsAt = parseSlashDate(stripTags(cells[3]));
    const type = classifyPromotionType(promotionText);
    const predictedFamilies = extractFamilies(promotionText);

    predictions.push({
      predictedSeller: seller,
      predictedPromotionText: promotionText,
      predictedPromotionType: type,
      predictedFamilies,
      predictedValue: extractValueToken(promotionText),
      predictedDiscountPercent: extractDiscountPercent(type, promotionText),
      predictedStartsAt,
      predictedEndsAt,
      refUrl: cells[4] ? extractRefUrl(cells[4]) : null,
      rawMarker: extractMarker(promoCellHtml),
      fingerprint: buildPredictionFingerprint(
        seller,
        predictedFamilies,
        predictedStartsAt,
        predictedEndsAt
      ),
    });
  }

  return { sourceUrl, sourceLastUpdated, predictions };
}
