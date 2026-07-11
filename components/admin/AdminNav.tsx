"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Admin navigation (client island) — grouped links with active-state
 * highlighting. Grouping keeps the now-long nav scannable; the active link is
 * resolved by longest matching path prefix so e.g. /admin/signals/queue
 * highlights "Feed Queue" rather than "Signals".
 */

interface NavLink {
  href: string;
  label: string;
}

const GROUPS: NavLink[][] = [
  [{ href: "/admin/dashboard", label: "Dashboard" }],
  [
    { href: "/admin/stores", label: "Stores" },
    { href: "/admin/cashback", label: "Cashback" },
    { href: "/admin/gift-cards", label: "Gift Cards" },
    { href: "/admin/points", label: "Points" },
    { href: "/admin/card-offers", label: "Card Offers" },
    { href: "/admin/card-reports", label: "Corrections" },
    { href: "/admin/weekly-deals", label: "Weekly Deals" },
  ],
  [
    { href: "/admin/signals", label: "Signals" },
    { href: "/admin/signals/queue", label: "Review Queue" },
    { href: "/admin/signals/sources", label: "Feed Sources" },
    { href: "/admin/offer-changes", label: "Offer Changes" },
    { href: "/admin/compliance", label: "Compliance" },
    { href: "/admin/monitor", label: "Monitor" },
    { href: "/admin/cleanup", label: "Cleanup" },
  ],
  [{ href: "/admin/audit", label: "Audit" }],
];

const ALL_HREFS = GROUPS.flat().map((link) => link.href);

export function AdminNav() {
  const pathname = usePathname();
  const activeHref = ALL_HREFS.filter(
    (href) => pathname === href || pathname.startsWith(`${href}/`)
  ).sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {GROUPS.map((group, groupIndex) => (
        <div key={group[0].href} className="flex flex-wrap items-center gap-1">
          {groupIndex > 0 ? (
            <span
              aria-hidden
              className="mx-1 hidden h-4 w-px bg-border sm:inline-block"
            />
          ) : null}
          {group.map((link) => {
            const active = link.href === activeHref;
            return (
              <Button
                key={link.href}
                asChild
                size="sm"
                variant={active ? "secondary" : "ghost"}
                className={cn(active && "font-medium")}
              >
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </Button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default AdminNav;
