"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DealsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center"><h1 className="text-2xl font-bold">Deals could not be loaded</h1><p className="mt-2 text-sm text-muted-foreground">The public data source is temporarily unavailable. No demo records have been substituted.</p><div className="mt-5 flex gap-2"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/">Go home</Link></Button></div></main>;
}
