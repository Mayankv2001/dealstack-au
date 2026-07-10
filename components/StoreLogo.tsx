"use client";

import Image from "next/image";
import { useState } from "react";
import type { Store, StoreLogoTheme } from "@/lib/data";
import { safeLogoPath } from "@/lib/security/urlPolicy";
import { cn } from "@/lib/utils";

/**
 * Store/brand logo tile.
 *
 * Preference order:
 *   1. A manually provided local logo asset (`store.logoPath` in public/logos),
 *      rendered with next/image inside a clean neutral container.
 *   2. If that file is missing/fails to load → a brand-INSPIRED CSS tile.
 *   3. If there's no theme → a neutral initials tile.
 *
 * No external images, no hotlinking, no scraping. `onError` requires client
 * state, so this is a client component (safely rendered by server components).
 * Accessible via role/alt = "{name} logo".
 */

const SIZES = {
  // Card tiles stay square; the lg hero tile is wider so wide wordmarks
  // (MYER, Coles, Kogan, Amazon) aren't lost in a square with empty space.
  xs: { tile: "size-7 rounded-md", text: "text-[9px]", sub: "text-[6px]", w: 28, h: 28 },
  sm: { tile: "size-9 rounded-lg", text: "text-[10px]", sub: "text-[7px]", w: 36, h: 36 },
  md: { tile: "size-11 rounded-lg", text: "text-[13px]", sub: "text-[8px]", w: 44, h: 44 },
  lg: { tile: "h-16 w-28 rounded-xl", text: "text-lg", sub: "text-[10px]", w: 112, h: 64 },
} as const;

export type StoreLogoSize = keyof typeof SIZES;

export function StoreLogo({
  store,
  text,
  subtext,
  theme,
  size = "sm",
  className,
}: {
  store?: Store;
  /** Override the wordmark (e.g. when only a name is known). */
  text?: string;
  subtext?: string;
  theme?: StoreLogoTheme;
  size?: StoreLogoSize;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const resolvedTheme = theme ?? store?.logoTheme ?? null;
  const label =
    text ??
    store?.logoText ??
    store?.logo ??
    store?.name?.slice(0, 2).toUpperCase() ??
    "?";
  const sub = subtext ?? store?.logoSubtext;
  const name = store?.name ?? label;
  const s = SIZES[size];
  const logoPath = safeLogoPath(store?.logoPath ?? null);

  // 1) Real local logo asset, in a clean neutral (white) container.
  if (logoPath && !imgFailed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden border bg-white p-1",
          s.tile,
          className
        )}
      >
        <Image
          src={logoPath}
          alt={`${name} logo`}
          width={s.w}
          height={s.h}
          unoptimized
          onError={() => setImgFailed(true)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  // 2) Brand-inspired CSS tile (also the fallback when the image fails).
  if (resolvedTheme) {
    return (
      <span
        role="img"
        aria-label={`${name} logo`}
        style={{
          background: resolvedTheme.bg,
          color: resolvedTheme.fg,
          ...(resolvedTheme.ring
            ? { boxShadow: `inset 0 0 0 1px ${resolvedTheme.ring}` }
            : {}),
        }}
        className={cn(
          "relative flex shrink-0 select-none flex-col items-center justify-center overflow-hidden px-0.5 font-extrabold leading-none tracking-tight shadow-sm",
          s.tile,
          s.text,
          className
        )}
      >
        <span>{label}</span>
        {sub && (
          <span className={cn("mt-0.5 font-semibold opacity-80", s.sub)}>
            {sub}
          </span>
        )}
        {resolvedTheme.accent && (
          <span
            aria-hidden
            style={{ background: resolvedTheme.accent }}
            className="absolute inset-x-0 bottom-0 h-[3px]"
          />
        )}
      </span>
    );
  }

  // 3) Neutral initials tile (no brand theme available).
  return (
    <span
      role="img"
      aria-label={`${name} logo`}
      className={cn(
        "flex shrink-0 select-none flex-col items-center justify-center border bg-muted px-0.5 font-bold leading-none tracking-tight text-foreground",
        s.tile,
        s.text,
        className
      )}
    >
      <span>{label}</span>
      {sub && (
        <span className={cn("mt-0.5 font-medium text-muted-foreground", s.sub)}>
          {sub}
        </span>
      )}
    </span>
  );
}

export default StoreLogo;
