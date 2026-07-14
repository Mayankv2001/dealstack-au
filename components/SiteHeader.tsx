"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  CircleDollarSign,
  Gift,
  Home,
  Menu,
  Search,
  Star,
  Store,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Deals", href: "/deals", icon: BadgePercent },
  { label: "Gift cards", href: "/gift-cards", icon: Gift },
  {
    label: "Cashback",
    href: "/deals?kind=cashback",
    matchPath: "/cashback",
    icon: CircleDollarSign,
  },
  { label: "Points", href: "/rewards", icon: Star },
  { label: "Stores", href: "/stores", icon: Store },
] as const;

const MOBILE_DOCK_LINKS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Deals", href: "/deals", icon: BadgePercent },
  { label: "Plan", href: "/search", icon: Search, primary: true },
  { label: "Gift cards", href: "/gift-cards", icon: Gift },
  { label: "Stores", href: "/stores", icon: Store },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One public navigation system for every route. The desktop header keeps the
 * purchase planner visible; mobile uses a labelled, full-width menu so people
 * never have to infer what an icon does.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/90 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />

          <nav
            className="ml-4 hidden items-center gap-1 lg:flex"
            aria-label="Primary navigation"
          >
            {NAV_LINKS.map(({ label, href, ...link }) => {
              const active = isActive(
                pathname,
                "matchPath" in link ? link.matchPath : href,
              );
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-emerald-950 text-white dark:bg-emerald-200 dark:text-emerald-950"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <form
            action="/search"
            className="relative ml-auto hidden w-full max-w-[17rem] xl:block"
            role="search"
          >
            <label htmlFor="site-search" className="sr-only">
              Search DealStack
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="site-search"
              name="q"
              type="search"
              placeholder="Search store or product"
              className="h-10 w-full rounded-full border border-foreground/10 bg-muted/55 pl-9 pr-3 text-sm outline-none transition focus-visible:border-emerald-600 focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-emerald-500/10"
            />
            <input type="hidden" name="spend" value="500" />
          </form>

          <Link
            href="/search"
            className="ml-auto hidden h-10 items-center gap-2 rounded-full bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 sm:inline-flex xl:ml-2"
          >
            <Search aria-hidden className="size-4" />
            Plan a purchase
          </Link>

          <Link
            href="/search"
            className="ml-auto inline-flex size-10 items-center justify-center rounded-full border bg-background sm:hidden"
            aria-label="Search and plan a purchase"
          >
            <Search aria-hidden className="size-4" />
          </Link>

          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full border bg-background lg:hidden"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X aria-hidden className="size-4" />
            ) : (
              <Menu aria-hidden className="size-4" />
            )}
          </button>
        </div>

        {menuOpen ? (
          <div
            id="mobile-navigation"
            className="border-t bg-background lg:hidden"
          >
            <nav
              aria-label="Mobile navigation"
              className="mx-auto grid max-w-7xl gap-1 px-4 py-3 sm:grid-cols-2 sm:px-6"
            >
              {NAV_LINKS.map(({ label, href, icon: Icon, ...link }) => {
                const active = isActive(
                  pathname,
                  "matchPath" in link ? link.matchPath : href,
                );
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                      active
                        ? "bg-emerald-950 text-white dark:bg-emerald-200 dark:text-emerald-950"
                        : "hover:bg-muted",
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    {label}
                  </Link>
                );
              })}
              <Link
                href="/search"
                onClick={() => setMenuOpen(false)}
                className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white sm:col-span-2"
              >
                <Search aria-hidden className="size-4" />
                Build a purchase plan
              </Link>
              <Link
                href="/cards"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-muted sm:col-span-2"
              >
                Card offers
              </Link>
            </nav>
          </div>
        ) : null}
      </header>

      <nav
        aria-label="Mobile quick navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid h-[4.25rem] grid-cols-5 border-t border-foreground/10 bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_-20px_rgba(15,23,42,0.5)] backdrop-blur-xl lg:hidden"
      >
        {MOBILE_DOCK_LINKS.map(({ label, href, icon: Icon, ...item }) => {
          const active = isActive(pathname, href);
          const primary = "primary" in item && item.primary;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-bold",
                active ? "text-emerald-700" : "text-muted-foreground",
                primary && "text-emerald-800",
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full",
                  primary &&
                    "-mt-5 size-12 border-4 border-background bg-emerald-700 text-white shadow-lg",
                )}
              >
                <Icon aria-hidden className={primary ? "size-5" : "size-4"} />
              </span>
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default SiteHeader;
