"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

/**
 * Homepage sticky nav — the only state here is the mobile-menu toggle.
 * Extracted from HomeClient so the rest of the page can server-render.
 */

const navLinks = [
  { label: "Stores", href: "/stores", external: true },
  { label: "Stacks", href: "/deals?view=stacks", external: true },
  { label: "Deals", href: "/deals", external: true },
  { label: "Card offers", href: "/cards", external: true },
  { label: "How it works", href: "#how-it-works", external: false },
];

export function HomeNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          {navLinks.map((link) =>
            link.external ? (
              <Link
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            )
          )}
        </nav>
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="hidden bg-emerald-600 text-white hover:bg-emerald-700 sm:inline-flex"
          >
            <a href="#store-search">Search stores</a>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t bg-background/95 backdrop-blur md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 text-sm font-medium sm:px-6">
            {navLinks.map((link) =>
              link.external ? (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </a>
              )
            )}
            <div className="mt-2 flex flex-col gap-2 border-t pt-3">
              <Button
                asChild
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <a href="#store-search" onClick={() => setMenuOpen(false)}>
                  Search stores
                </a>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

export default HomeNav;
