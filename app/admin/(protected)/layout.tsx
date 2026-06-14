import type { ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";

/**
 * Protected admin shell. Lives in a (protected) route group so the gate below
 * wraps the dashboard (and future cashback/gift-card/points/signals pages)
 * WITHOUT wrapping /admin/login — a layout that requireAdmin()s its own login
 * page would redirect-loop. login / auth/callback / logout sit outside this
 * group on purpose.
 *
 * requireAdmin() is the hard gate (valid session + email in the admins
 * allowlist); proxy.ts is only an optimistic first check. The nav below is the
 * "after login" navigation.
 */

const NAV_LINKS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/cashback", label: "Cashback" },
  { href: "/admin/gift-cards", label: "Gift Cards" },
  { href: "/admin/points", label: "Points" },
  { href: "/admin/signals", label: "Signals" },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Logo />
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV_LINKS.map((link) => (
              <Button key={link.href} asChild variant="ghost" size="sm">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {session.email}
            </span>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Back to site</Link>
            </Button>
            {/* POST (not a link) so route prefetch can never log the admin out. */}
            <form action="/admin/logout" method="post">
              <Button type="submit" variant="outline" size="sm">
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
