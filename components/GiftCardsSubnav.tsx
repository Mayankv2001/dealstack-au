import Link from "next/link";
import { CalendarClock, History, LibraryBig } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY_LINKS: ReadonlyArray<readonly [label: string, href: string]> = [
  ["Current offers", "/gift-cards"],
  ["Find a gift card", "/gift-cards/products"],
  ["Where can I use it?", "/gift-cards/where-to-use"],
  ["Where can I buy it?", "/gift-cards/where-to-buy"],
];

const RESEARCH_LINKS = [
  {
    label: "Weekly offers",
    href: "/gift-cards/weekly",
    icon: CalendarClock,
  },
  { label: "Offer history", href: "/gift-cards/history", icon: History },
  {
    label: "Member programmes",
    href: "/gift-cards/programmes",
    icon: LibraryBig,
  },
] as const;

function linkClass(active: boolean): string {
  return cn(
    "shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition",
    active
      ? "bg-foreground text-background"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

/** Shared, question-led navigation for every gift-card research route. */
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
        "grid gap-2 border-y py-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center",
        className,
      )}
    >
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {PRIMARY_LINKS.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={href === current ? "page" : undefined}
            className={linkClass(href === current)}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto border-t pt-2 [scrollbar-width:none] lg:border-l lg:border-t-0 lg:pl-2 lg:pt-0">
        {RESEARCH_LINKS.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={href === current ? "page" : undefined}
            className={cn(linkClass(href === current), "inline-flex items-center gap-1.5")}
          >
            <Icon aria-hidden className="size-3.5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default GiftCardsSubnav;
