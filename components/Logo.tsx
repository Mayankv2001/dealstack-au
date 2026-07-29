import Link from "next/link";

/** A compact, code-native mark: the bars are the saving layers in a stack. */
export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <Link
      href="/"
      className="group flex shrink-0 items-center gap-2.5"
      aria-label="DealStack AU home"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-700 shadow-sm transition-transform group-hover:-translate-y-0.5">
        <span aria-hidden className="flex flex-col items-start gap-[3px]">
          <span className="block h-[3px] w-[17px] rounded-full bg-white" />
          <span className="block h-[3px] w-[14px] rounded-full bg-white/85" />
          <span className="block h-[3px] w-[11px] rounded-full bg-white/70" />
        </span>
      </span>
      <span
        className={`font-heading text-lg font-black tracking-[-0.04em] sm:text-xl ${
          tone === "dark" ? "text-[#f7f5f0]" : ""
        }`}
      >
        DealStack{" "}
        <span
          className={
            tone === "dark"
              ? "text-[#f7f5f0]/60"
              : "text-emerald-700 dark:text-emerald-300"
          }
        >
          AU
        </span>
      </span>
    </Link>
  );
}

export default Logo;
