"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

/**
 * Root error boundary (Next 16: `unstable_retry` re-fetches and re-renders
 * the failed segment — preferred over `reset` for recovering from transient
 * server errors). Never renders error.message: repo failures embed table
 * names and Supabase detail that don't belong on a public screen.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="soft-panel mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
          <AlertTriangle className="size-8 text-amber-600 dark:text-amber-400" />
          <h1 className="text-2xl font-bold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            Sorry — this page hit a snag while loading. It&apos;s usually
            temporary.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => unstable_retry()}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
