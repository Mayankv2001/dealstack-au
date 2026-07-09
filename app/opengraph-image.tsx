import { ImageResponse } from "next/og";

/**
 * Sitewide default Open Graph image (1200×630). Because file-based metadata
 * cascades, this covers every public route (/, /deals, /search, /cards,
 * /resources) unless a nested segment provides its own — /stores/[slug] does.
 *
 * Rendered by Satori (next/og), which supports only flexbox + a subset of CSS:
 * every multi-child element sets `display: flex`, colours are hardcoded hexes
 * (Tailwind classes don't apply here), and NO fonts are supplied so next/og's
 * bundled Geist face is used — zero remote/local font fetch at request time.
 */

export const alt =
  "DealStack AU — stack cashback, gift cards & points at Australian stores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand palette — exact Tailwind emerald/slate hexes (the app's soft-emerald look).
const EMERALD_500 = "#10b981";
const EMERALD_600 = "#059669";
const EMERALD_900 = "#064e3b";
const EMERALD_50 = "#ecfdf5";
const SLATE_900 = "#0f172a";
const SLATE_700 = "#334155";
const SLATE_500 = "#64748b";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(135deg, ${EMERALD_50} 0%, #ffffff 55%, ${EMERALD_50} 100%)`,
        }}
      >
        {/* Brand row: stacked-bars mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              width: 88,
              height: 88,
              borderRadius: 22,
              background: `linear-gradient(135deg, ${EMERALD_500}, ${EMERALD_600})`,
              boxShadow: "0 12px 30px rgba(5,150,105,0.35)",
            }}
          >
            <div style={{ display: "flex", width: 44, height: 8, borderRadius: 9999, background: "#ffffff" }} />
            <div style={{ display: "flex", width: 44, height: 8, borderRadius: 9999, background: "rgba(255,255,255,0.85)" }} />
            <div style={{ display: "flex", width: 44, height: 8, borderRadius: 9999, background: "rgba(255,255,255,0.70)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>
            <span style={{ color: SLATE_900 }}>DealStack</span>
            <span style={{ color: EMERALD_600, marginLeft: 12 }}>AU</span>
          </div>
        </div>

        {/* Headline + tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 800,
              color: EMERALD_900,
              letterSpacing: -2,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            Stack every discount into one price.
          </div>
          <div style={{ display: "flex", fontSize: 38, color: SLATE_700, maxWidth: 940, lineHeight: 1.3 }}>
            {"Stack cashback, gift cards & points at Australian stores."}
          </div>
        </div>

        {/* Footer accent */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: 120,
              height: 10,
              borderRadius: 9999,
              background: `linear-gradient(90deg, ${EMERALD_500}, ${EMERALD_600})`,
            }}
          />
          <div style={{ display: "flex", fontSize: 26, color: SLATE_500 }}>
            {"Research the best stack — then verify before you buy."}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
