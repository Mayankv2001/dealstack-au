"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  defaultValue = "",
  placeholder = "Search a store, e.g. JB Hi-Fi",
  className,
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder={placeholder}
        className="h-11 pl-9 pr-24"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search stores"
      />
      <Button
        type="submit"
        size="sm"
        className="absolute right-1.5 top-1/2 -translate-y-1/2"
      >
        Search
      </Button>
    </form>
  );
}

export default SearchBar;
