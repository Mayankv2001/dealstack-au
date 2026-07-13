"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  /** Seeds the input when uncontrolled (e.g. the /search results header). */
  defaultValue?: string;
  /**
   * Optional controlled value. When provided (with onValueChange) the parent
   * owns the text — the homepage uses this so typing also filters the popular
   * stores grid live. Omit both for the default uncontrolled behaviour.
   */
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  buttonLabel?: string;
  className?: string;
  /** "lg" is the prominent hero search; "default" the inline results search. */
  size?: "default" | "lg";
  /**
   * "attached" tucks the button inside the input (used on /search). "split"
   * renders the input and button as separate adjacent pills (the hero).
   */
  layout?: "attached" | "split";
  autoFocus?: boolean;
  /** Include the purchase amount in the shareable /search URL. */
  showSpend?: boolean;
  defaultSpend?: number;
}

export function SearchBar({
  defaultValue = "",
  value,
  onValueChange,
  placeholder = "Search a store, e.g. JB Hi-Fi",
  buttonLabel = "Search",
  className,
  size = "default",
  layout = "attached",
  autoFocus,
  showSpend = false,
  defaultSpend = 500,
}: SearchBarProps) {
  const router = useRouter();
  const [internal, setInternal] = useState(defaultValue);
  const [spend, setSpend] = useState(defaultSpend);
  const isControlled = value !== undefined;
  const query = isControlled ? value : internal;

  const setQuery = (next: string) => {
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      const params = new URLSearchParams({ q });
      if (showSpend) params.set("spend", String(spend));
      router.push(`/search?${params.toString()}`);
    }
  };

  const lg = size === "lg";
  const split = layout === "split";

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        split
          ? "flex flex-col gap-2 sm:flex-row sm:items-stretch"
          : "relative",
        className
      )}
    >
      <div className={cn("relative", split && "flex-1")}>
        <Search
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
            lg ? "left-4 size-5" : "left-3 size-4"
          )}
        />
        <Input
          type="search"
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search stores"
          className={cn(
            "w-full bg-background shadow-sm",
            lg ? "h-14 rounded-2xl pl-12 text-base" : "h-11 rounded-xl pl-9",
            split ? (lg ? "pr-4" : "pr-3") : lg ? "pr-32" : "pr-24"
          )}
        />
      </div>
      {showSpend ? (
        <label className="flex h-14 items-center gap-2 rounded-2xl border bg-background px-3 text-sm shadow-sm sm:w-36">
          <span className="font-medium text-muted-foreground">Spend $</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={100000}
            step={10}
            value={spend}
            onChange={(event) => setSpend(Number(event.target.value) || defaultSpend)}
            aria-label="Planned spend in Australian dollars"
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
          />
        </label>
      ) : null}
      <Button
        type="submit"
        size={lg ? "default" : "sm"}
        className={cn(
          "bg-emerald-700 text-white hover:bg-emerald-800",
          split
            ? lg
              ? "h-14 rounded-2xl px-6 text-base"
              : "rounded-xl px-4"
            : cn("absolute top-1/2 -translate-y-1/2", lg ? "right-2 h-10 px-5" : "right-1.5")
        )}
      >
        {buttonLabel}
      </Button>
    </form>
  );
}

export default SearchBar;
