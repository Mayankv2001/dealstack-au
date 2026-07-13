import Link from "next/link";

/**
 * Brand mark + wordmark. The mark is a CSS-only emerald tile with three stacked
 * bars that read as savings layers stacking up — no external assets. Used across
 * the app (home, search, stores, admin, deals), so it stays prop-free and
 * theme-aware. The wordmark uses the editorial serif to match the headlines.
 */
export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm shadow-emerald-600/25 ring-1 ring-inset ring-white/15 transition-transform group-hover:-translate-y-0.5">
        <span aria-hidden className="flex flex-col items-center gap-[3px]">
          <span className="block h-[3px] w-[18px] rounded-full bg-white" />
          <span className="block h-[3px] w-[18px] rounded-full bg-white/85" />
          <span className="block h-[3px] w-[18px] rounded-full bg-white/70" />
        </span>
      </span>
      <span className="font-serif text-xl font-semibold tracking-tight">
        DealStack{" "}
        <span className="text-emerald-700 dark:text-emerald-300">AU</span>
      </span>
    </Link>
  );
}

export default Logo;
