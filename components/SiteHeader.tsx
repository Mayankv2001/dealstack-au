import Link from "next/link";
import { Menu, Search } from "lucide-react";
import Logo from "@/components/Logo";

/**
 * Shared sticky site header. Extracted from the hand-rolled copy on
 * app/stores/[slug]/page.tsx so detail pages (stores, deals) render identical
 * chrome. Server-safe: no hooks, no state.
 */
export function SiteHeader() {
  const links = [
    ["Discover", "/deals"],
    ["Gift cards", "/gift-cards"],
    ["Stores", "/stores"],
    ["Rewards", "/rewards"],
    ["Cards", "/cards"],
  ] as const;
  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
        <form action="/search" className="relative ml-auto hidden w-full max-w-xs xl:block" role="search">
          <label htmlFor="site-search" className="sr-only">Search DealStack</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id="site-search" name="q" type="search" placeholder="Store, card or programme" className="h-9 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          <input type="hidden" name="spend" value="500" />
        </form>
        <Link href="/search" className="ml-auto inline-flex size-9 items-center justify-center rounded-lg border bg-background xl:hidden" aria-label="Search DealStack">
          <Search aria-hidden className="size-4" />
        </Link>
        <details className="group relative lg:hidden">
          <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border bg-background [&::-webkit-details-marker]:hidden" aria-label="Open navigation">
            <Menu aria-hidden className="size-4" />
          </summary>
          <nav aria-label="Mobile navigation" className="absolute right-0 top-11 grid w-52 gap-1 rounded-xl border bg-background p-2 shadow-lg">
            {links.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">{label}</Link>
            ))}
            <Link href="/search" className="rounded-lg border px-3 py-2 text-sm font-medium">Search purchase plans</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}

export default SiteHeader;
