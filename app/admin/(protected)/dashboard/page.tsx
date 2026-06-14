import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { getDashboardCounts } from "@/lib/admin/repos/dashboard";

export const metadata: Metadata = {
  title: "Admin dashboard | DealStack AU",
};

interface Stat {
  label: string;
  value: number;
}

interface Section {
  title: string;
  description: string;
  href: string;
  total: number;
  stats: Stat[];
}

export default async function AdminDashboardPage() {
  // Belt-and-suspenders: the protected layout already gates, but every admin
  // page verifies independently (proxy is only an optimistic check).
  const { email } = await requireAdmin();
  const counts = await getDashboardCounts();

  const sections: Section[] = [
    {
      title: "Cashback",
      description: "ShopBack & TopCashback offers (no Cashrewards).",
      href: "/admin/cashback",
      total: counts.cashback.total,
      stats: [
        { label: "Published", value: counts.cashback.published },
        { label: "Draft", value: counts.cashback.unpublished },
      ],
    },
    {
      title: "Gift Cards",
      description: "Discounted gift-card offers and where they're accepted.",
      href: "/admin/gift-cards",
      total: counts.giftCards.total,
      stats: [
        { label: "Published", value: counts.giftCards.published },
        { label: "Draft", value: counts.giftCards.unpublished },
      ],
    },
    {
      title: "Points",
      description: "Points programs and earn-rate boosts.",
      href: "/admin/points",
      total: counts.points.total,
      stats: [
        { label: "Published", value: counts.points.published },
        { label: "Draft", value: counts.points.unpublished },
      ],
    },
    {
      title: "OzBargain Signals",
      description: "Manually curated community deal signals.",
      href: "/admin/signals",
      total: counts.signals.total,
      stats: [
        { label: "Approved", value: counts.signals.approved },
        { label: "Pending", value: counts.signals.pending },
      ],
    },
    {
      title: "Weekly Deals",
      description: "Curated editorial cards referencing existing offer ids.",
      href: "/admin/weekly-deals",
      total: counts.weeklyDeals.total,
      stats: [
        { label: "Published", value: counts.weeklyDeals.published },
        { label: "Draft", value: counts.weeklyDeals.unpublished },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live counts straight from Supabase. Signed in as {email}.
        </p>
      </header>

      <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Manual admin only.</span>{" "}
        All deal data is manually entered or curated. No scraping or automated
        source fetching is running.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title} className="flex flex-col">
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {section.total}
                </span>
                <span className="text-xs text-muted-foreground">total</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {section.stats.map((stat) => (
                  <span key={stat.label}>
                    <span className="font-medium text-foreground tabular-nums">
                      {stat.value}
                    </span>{" "}
                    {stat.label}
                  </span>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline" size="sm">
                <Link href={section.href}>Manage</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
