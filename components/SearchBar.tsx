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
  className?: string;
  /** "lg" is the prominent hero search; "default" the inline results search. */
  size?: "default" | "lg";
  autoFocus?: boolean;
}

export function SearchBar({
  defaultValue = "",
  value,
  onValueChange,
  placeholder = "Search a store, e.g. JB Hi-Fi",
  className,
  size = "default",
  autoFocus,
}: SearchBarProps) {
  const router = useRouter();
  const [internal, setInternal] = useState(defaultValue);
  const isControlled = value !== undefined;
  const query = isControlled ? value : internal;

  const setQuery = (next: string) => {
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const lg = size === "lg";

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground",
          lg ? "size-5" : "size-4 left-3"
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
          "bg-background shadow-sm",
          lg
            ? "h-14 rounded-2xl pl-11 pr-28 text-base shadow-md shadow-emerald-900/[0.06]"
            : "h-11 pl-9 pr-24"
        )}
      />
      <Button
        type="submit"
        size={lg ? "default" : "sm"}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 bg-emerald-600 text-white hover:bg-emerald-700",
          lg ? "right-2 h-10 px-5" : "right-1.5"
        )}
      >
        Search
      </Button>
    </form>
  );
}

export default SearchBar;
