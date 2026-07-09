import { ImageResponse } from "next/og";
import { getStores } from "@/lib/repos";

/**
 * Per-store Open Graph image (1200×630) — same brand frame as the sitewide
 * default, with the store name featured. Loaded via the same `getStores()` repo
 * call the store page and sitemap use (Supabase when configured, static
 * fallback otherwise).
 *
 * Renders on demand per request — deliberately NOT wired into
 * `generateStaticParams`, so it never adds a build-time render per store.
 *
 * An unknown / unpublished slug (old share links can outlive a store) degrades
 * to the generic brand card and NEVER throws — a broken preview image on a live
 * share is a worse look than a generic one.
 */

export const alt = "Deal stack on DealStack AU";
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

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Same read the page uses; falls back to static and never throws in practice,
  // but guard anyway so the OG route degrades to the generic card, never a 500.
  let storeName: string | null = null;
  try {
    const stores = await getStores();
    storeName = stores.find((s) => s.id === slug)?.name ?? null;
  } catch {
    storeName = null;
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: 76,
              height: 76,
              borderRadius: 19,
              background: `linear-gradient(135deg, ${EMERALD_500}, ${EMERALD_600})`,
              boxShadow: "0 10px 26px rgba(5,150,105,0.35)",
            }}
          >
            <div style={{ display: "flex", width: 38, height: 7, borderRadius: 9999, background: "#ffffff" }} />
            <div style={{ display: "flex", width: 38, height: 7, borderRadius: 9999, background: "rgba(255,255,255,0.85)" }} />
            <div style={{ display: "flex", width: 38, height: 7, borderRadius: 9999, background: "rgba(255,255,255,0.70)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
            <span style={{ color: SLATE_900 }}>DealStack</span>
            <span style={{ color: EMERALD_600, marginLeft: 10 }}>AU</span>
          </div>
        </div>

        {/* Store block, or the generic frame for an unknown/unpublished slug */}
        {storeName ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: 4, color: EMERALD_600 }}>
              DEAL STACK
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 96,
                fontWeight: 800,
                color: EMERALD_900,
                letterSpacing: -3,
                lineHeight: 1,
                maxWidth: 1040,
              }}
            >
              {storeName}
            </div>
            <div style={{ display: "flex", fontSize: 34, color: SLATE_700, maxWidth: 980, lineHeight: 1.3 }}>
              {"Cashback, gift cards, points & codes — stacked into one effective price."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                display: "flex",
                fontSize: 76,
                fontWeight: 800,
                color: EMERALD_900,
                letterSpacing: -2,
                lineHeight: 1.08,
                maxWidth: 1000,
              }}
            >
              Stack every discount into one price.
            </div>
            <div style={{ display: "flex", fontSize: 36, color: SLATE_700, maxWidth: 940, lineHeight: 1.3 }}>
              {"Stack cashback, gift cards & points at Australian stores."}
            </div>
          </div>
        )}

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
            {"Verify current offers before you buy."}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
