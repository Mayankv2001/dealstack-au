import type { Metadata } from "next";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Admin dashboard | DealStack AU",
};

const SECTIONS = [
  {
    title: "Cashback",
    description: "ShopBack & TopCashback offers (no Cashrewards).",
  },
  {
    title: "Gift Cards",
    description: "Discounted gift-card offers and where they're accepted.",
  },
  {
    title: "Points",
    description: "Points programs and earn-rate boosts.",
  },
  {
    title: "OzBargain Signals",
    description: "Manually curated community deal signals.",
  },
];

export default async function AdminDashboardPage() {
  // Belt-and-suspenders: the protected layout already gates, but every admin
  // page verifies independently (proxy is only an optimistic check).
  const { email } = await requireAdmin();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manual data management for DealStack AU — every record is entered by
          hand. No scraping, no automated agents, no external source fetching.
          Signed in as {email}.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <Button variant="outline" size="sm" disabled>
                Manage
              </Button>
              <span className="text-xs font-medium text-muted-foreground">
                Coming soon
              </span>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
