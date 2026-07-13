"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Copy a coupon code to the clipboard with clear, accessible feedback.
 *
 * The button announces success via aria-live so screen-reader users hear the
 * confirmation, and it degrades gracefully when the Clipboard API is
 * unavailable (older browsers / insecure contexts) rather than throwing.
 */
export default function CopyCodeButton({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `Copied code ${code}` : `Copy code ${code}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      {copied ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        <Copy aria-hidden className="size-3.5" />
      )}
      <span className="font-mono tracking-wide">{code}</span>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
      <span aria-hidden className="font-sans text-[10px] font-medium text-foreground">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
