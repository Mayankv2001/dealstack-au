import Link from "next/link";

/**
 * Brand mark + wordmark. The mark is a CSS-only emerald tile with three stacked
 * bars that read as savings layers stacking up — no external assets. Used across
 * the app (home, search, stores, admin, deals), so it stays prop-free and
 * theme-aware. The wordmark uses the editorial serif to match the headlines.
 */
export function Logo() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="DealStack AU home">
      <span className="flex size-10 items-center justify-center rounded-[0.9rem] bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 shadow-sm shadow-emerald-700/25 ring-1 ring-inset ring-white/20 transition-transform group-hover:-translate-y-0.5">
        <span aria-hidden className="flex flex-col items-center gap-[3px]">
          <span className="block h-[3px] w-[18px] rounded-full bg-white" />
          <span className="block h-[3px] w-[18px] rounded-full bg-white/85" />
          <span className="block h-[3px] w-[18px] rounded-full bg-white/70" />
        </span>
      </span>
      <span className="text-lg font-black tracking-[-0.035em] sm:text-xl">
        DealStack{" "}
        <span className="text-emerald-700 dark:text-emerald-300">AU</span>
      </span>
    </Link>
  );
}

export default Logo;
