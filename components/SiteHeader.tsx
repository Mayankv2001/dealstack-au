import Link from "next/link";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

/**
 * Shared sticky site header. Extracted from the hand-rolled copy on
 * app/stores/[slug]/page.tsx so detail pages (stores, deals) render identical
 * chrome. Server-safe: no hooks, no state.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/deals">Deals</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/stores">Stores</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/cards">Cards</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
            <Link href="/gift-cards">Gift cards</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
            <Link href="/resources">Resources</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="hidden bg-background sm:inline-flex"
          >
            <Link href="/search">All stores</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
