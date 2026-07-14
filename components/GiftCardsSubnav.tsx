import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS: ReadonlyArray<readonly [label: string, href: string]> = [
  ["Current offers", "/gift-cards"],
  ["Product directory", "/gift-cards/products"],
  ["Where to use", "/gift-cards/where-to-use"],
  ["Offer history", "/gift-cards/history"],
  ["Programmes", "/gift-cards/programmes"],
];

/**
 * The gift-card section pill nav, shared by /gift-cards and every subpage so
 * the section reads as one product instead of five disconnected routes.
 * `current` marks the active pill (also exposed via aria-current).
 */
export function GiftCardsSubnav({
  current,
  className,
}: {
  current: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Gift card tools"
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 text-xs font-semibold [scrollbar-width:none]",
        className
      )}
    >
      {LINKS.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={href === current ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full border bg-background px-3 py-1.5 hover:border-emerald-500/50",
            href === current &&
              "border-emerald-700 bg-emerald-700 text-white hover:border-emerald-700"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export default GiftCardsSubnav;
