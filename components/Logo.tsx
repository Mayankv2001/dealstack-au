import Link from "next/link";

/**
 * Brand mark + wordmark. The mark is a CSS-only "stacked bars" glyph (three
 * ascending bars) that reads as savings layers stacking up — no external
 * assets. Used across the app (home, search, stores, admin, deals), so it stays
 * prop-free and theme-aware.
 */
export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-md shadow-emerald-600/25 ring-1 ring-inset ring-white/15 transition-transform group-hover:-translate-y-0.5">
        <span aria-hidden className="flex flex-col items-center gap-[3px]">
          <span className="block h-[3px] w-2.5 rounded-full bg-white/70" />
          <span className="block h-[3px] w-3.5 rounded-full bg-white/85" />
          <span className="block h-[3px] w-[18px] rounded-full bg-white" />
        </span>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-base font-bold tracking-tight">
          DealStack{" "}
          <span className="text-emerald-600 dark:text-emerald-400">AU</span>
        </span>
        <span className="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground">
          STACK EVERY SAVING
        </span>
      </span>
    </Link>
  );
}

export default Logo;
