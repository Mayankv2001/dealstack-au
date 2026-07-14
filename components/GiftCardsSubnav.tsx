import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS: ReadonlyArray<readonly [label: string, href: string]> = [
  ["Find an offer", "/gift-cards"],
  ["Find a gift card", "/gift-cards/products"],
  ["Where can I use it?", "/gift-cards/where-to-use"],
  ["Where can I buy it?", "/gift-cards/where-to-buy"],
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
        "flex gap-1 overflow-x-auto rounded-2xl border border-foreground/10 bg-card p-1.5 text-xs font-semibold shadow-sm [scrollbar-width:none]",
        className
      )}
    >
      {LINKS.map(([label, href], index) => (
        <Link
          key={href}
          href={href}
          aria-current={href === current ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-xl border border-transparent px-3 py-2 text-muted-foreground transition hover:bg-muted hover:text-foreground",
            index === 4 && "ml-1 border-l-foreground/10",
            href === current &&
              "border-emerald-700 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 hover:text-white"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export default GiftCardsSubnav;
