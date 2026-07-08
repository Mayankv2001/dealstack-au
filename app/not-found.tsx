import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

/**
 * Root 404 boundary — rendered for notFound() calls (e.g. unknown store
 * slugs) and any unmatched URL. Mirrors the public pages' shell so dead
 * links land somewhere branded with a way back in.
 */

export const metadata: Metadata = {
  title: "Page not found | DealStack AU",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/deals">Deals</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/cards">Cards</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/resources">Resources</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center shadow-sm">
          <SearchX className="size-8 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            This page doesn&apos;t exist or the store may have been
            unpublished.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/deals">Weekly deals</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/search">Search stores</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
