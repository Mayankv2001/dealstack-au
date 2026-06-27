"use client";

import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { AdminActionResult } from "@/lib/admin/rate-limit";

/**
 * Reusable button for admin server actions that return an {@link AdminActionResult}
 * (the toggles / queue actions that used to return `void`). It replaces the
 * `<form action={boundAction}>` pattern so a returned `{ error }` — e.g. the
 * rate-limit message — is surfaced gracefully instead of being thrown as a 500.
 *
 * Error display:
 *   - Pass `onError` (and optionally `onStart`) to bubble the message up so a
 *     parent can render one shared error line per row/card — used by
 *     AdminListTable and QueueClient.
 *   - Omit `onError` and the button renders its own inline error span — used
 *     standalone, e.g. the feed-sources list (a server component).
 *
 * It never resets or clears any surrounding form state.
 */
export interface ActionButtonProps {
  /** Bound server action, e.g. setPublished.bind(null, id, next). */
  run: () => Promise<AdminActionResult>;
  children: ReactNode;
  /** Optional confirm() gate before running (e.g. destructive toggles). */
  confirm?: string;
  /** Bubble the error to the parent instead of rendering it inline. */
  onError?: (message: string) => void;
  /** Cleared by the parent before re-running, when it owns the error line. */
  onStart?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "xs" | "sm" | "lg";
  className?: string;
  title?: string;
}

export function ActionButton({
  run,
  children,
  confirm,
  onError,
  onStart,
  variant = "outline",
  size = "sm",
  className,
  title,
}: ActionButtonProps) {
  const [isPending, startTransition] = useTransition();
  // Only used when the parent does not own the error line (no onError).
  const [selfError, setSelfError] = useState<string | null>(null);

  const handleClick = () => {
    if (confirm && !window.confirm(confirm)) return;
    onStart?.();
    if (!onError) setSelfError(null);
    startTransition(async () => {
      const result = await run();
      if ("error" in result) {
        if (onError) onError(result.error);
        else setSelfError(result.error);
      }
    });
  };

  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      title={title}
      disabled={isPending}
      onClick={handleClick}
    >
      {children}
    </Button>
  );

  // Parent owns the error line → render just the button.
  if (onError) return button;

  // Standalone → render the button with its own inline error.
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {button}
      {selfError ? (
        <span role="alert" className="text-xs text-destructive">
          {selfError}
        </span>
      ) : null}
    </span>
  );
}

export default ActionButton;
