import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CreditCard,
  ExternalLink,
  Gift,
  Plane,
  ShoppingCart,
  Sparkles,
  Star,
  TicketPercent,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Points & rewards resources — DealStack AU",
};

/**
 * Static educational content only — no live offers, no fetched data.
 * Examples are illustrative; programs change their earn rates and
 * promotions frequently.
 */

interface ResourceItem {
  title: string;
  description: string;
}

interface ResourceSection {
  id: string;
  icon: typeof Star;
  iconClass: string;
  title: string;
  badge: string;
  intro: string;
  items: ResourceItem[];
  links: { label: string; href: string }[];
}

const sections: ResourceSection[] = [
  {
    id: "credit-cards",
    icon: CreditCard,
    iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "Credit card sign-up bonus resources",
    badge: "Biggest single boost",
    intro:
      "Banks regularly offer large bonus point hauls (often 50,000–100,000+ Qantas or Velocity points) for new cardholders who meet a minimum spend. One good sign-up bonus can outweigh years of everyday earning — but cards carry real costs and credit implications.",
    items: [
      {
        title: "Compare current sign-up offers",
        description:
          "Comparison sites and points blogs track which banks have the biggest bonuses right now. Offers rotate monthly — never apply from an old article.",
      },
      {
        title: "Check the minimum spend and fee",
        description:
          "Bonuses usually require $3,000–$6,000 spend in the first 90 days, and annual fees of $100–$450 apply. Do the maths: points value minus fee.",
      },
      {
        title: "Mind eligibility rules",
        description:
          "Most banks exclude you if you've held the same card (or sometimes any of their cards) in the past 12–24 months.",
      },
    ],
    links: [
      { label: "Point Hacks card guides", href: "https://www.pointhacks.com.au" },
    ],
  },
  {
    id: "flybuys",
    icon: ShoppingCart,
    iconClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    title: "Flybuys earning methods",
    badge: "Coles ecosystem",
    intro:
      "Flybuys is the Coles Group program — Coles, Kmart, Target, Liquorland, First Choice and partners. Base rate is 1 point per $1, but targeted promos are where the value is.",
    items: [
      {
        title: "Activate weekly point boosters",
        description:
          "The Flybuys app regularly offers targeted deals like 10x points on a $50+ shop. Activation is required before you shop.",
      },
      {
        title: '"Spend $X over N weeks" challenges',
        description:
          "Recurring offers of 10,000+ points for hitting a spend target across consecutive weeks — often the best $-per-point earn in the program.",
      },
      {
        title: "Convert to Velocity",
        description:
          "Flybuys points transfer to Velocity (commonly 2 Flybuys → 1 Velocity), and transfer bonuses of 15–20% appear a few times a year.",
      },
    ],
    links: [{ label: "Flybuys", href: "https://www.flybuys.com.au" }],
  },
  {
    id: "everyday-rewards",
    icon: Star,
    iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    title: "Everyday Rewards earning methods",
    badge: "Woolworths ecosystem",
    intro:
      "Everyday Rewards covers Woolworths, Big W, BWS and partners like Ampol. 1 point per $1 base, redeemable as $10 off per 2,000 points or converted to Qantas Points.",
    items: [
      {
        title: "Boost before you shop",
        description:
          "Targeted boosts in the app (bonus points on categories or spend targets) must be activated first — check before every shop.",
      },
      {
        title: "Choose Qantas conversion",
        description:
          "2,000 Everyday Rewards points convert to 1,000 Qantas Points — usually better value for flyers than $10 off groceries, especially during conversion bonus promos.",
      },
      {
        title: "Stack with WISH gift cards",
        description:
          "Pay with discounted WISH eGift cards (commonly ~5% off via member benefit programs) while still scanning your Rewards card.",
      },
    ],
    links: [
      { label: "Everyday Rewards", href: "https://www.everydayrewards.com.au" },
    ],
  },
  {
    id: "qantas",
    icon: Plane,
    iconClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    title: "Qantas Points earning methods",
    badge: "Frequent flyer",
    intro:
      "Beyond flying, most Qantas Points in Australia are earned on the ground: cards, shopping portals, groceries and partners.",
    items: [
      {
        title: "Qantas Shopping online mall",
        description:
          "Click through the Qantas Shopping portal before buying from hundreds of retailers to earn points per $1 — rates spike during bonus events.",
      },
      {
        title: "Everyday Rewards conversion",
        description:
          "Set your Everyday Rewards account to auto-convert to Qantas Points for grocery earning.",
      },
      {
        title: "Wine, insurance, energy partners",
        description:
          "Qantas Wine and partner sign-ups (insurance, energy plans) periodically offer large point bundles — value them against the best cash price first.",
      },
    ],
    links: [
      { label: "Qantas Frequent Flyer", href: "https://www.qantas.com" },
    ],
  },
  {
    id: "velocity",
    icon: Plane,
    iconClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    title: "Velocity Points earning methods",
    badge: "Frequent flyer",
    intro:
      "Velocity (Virgin Australia) points are typically easier to earn from supermarket spend than Qantas, thanks to the Flybuys pipeline.",
    items: [
      {
        title: "Flybuys transfers",
        description:
          "The Coles → Flybuys → Velocity route is the backbone: wait for 15–20% transfer bonus windows before converting.",
      },
      {
        title: "Velocity e-Store",
        description:
          "Like Qantas Shopping — click through to partner retailers (including Amazon AU categories at times) to earn points per $1.",
      },
      {
        title: "7-Eleven, BP and partners",
        description:
          "Fuel and everyday partners earn Velocity directly — link accounts once and the earn is automatic.",
      },
    ],
    links: [
      {
        label: "Velocity Frequent Flyer",
        href: "https://www.velocityfrequentflyer.com",
      },
    ],
  },
  {
    id: "gift-cards",
    icon: Gift,
    iconClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    title: "Gift card portals & member benefits",
    badge: "Stack layer",
    intro:
      "Discounted gift cards are the quietest stack layer: buy below face value, pay full value at the till — on top of codes, cashback and points.",
    items: [
      {
        title: "Insurer & motoring club portals",
        description:
          "RACV, RACQ, NRMA and similar memberships include gift card stores with ~4–5% off major brands (Coles Group, WISH, JB Hi-Fi and more).",
      },
      {
        title: "Bank and employer benefit programs",
        description:
          "Many banks, super funds and employers offer the same discounted gift card portals — check what you already have access to before paying for a membership.",
      },
      {
        title: "Supermarket gift card promos",
        description:
          "Coles and Woolworths regularly run bonus-points promos on third-party gift cards (e.g. 10x points) — a way to pre-buy spending at other retailers with a points kicker.",
      },
    ],
    links: [],
  },
];

const warnings: ResourceItem[] = [
  {
    title: "Annual fees are real money",
    description:
      "Points cards charge $100–$450+ a year. If the fee outweighs the value of points you'll actually redeem, a no-fee card or cash-value card wins.",
  },
  {
    title: "Every application is a credit check",
    description:
      "Card applications appear on your credit file and can affect upcoming home loan or finance applications. Don't churn cards if you're borrowing soon.",
  },
  {
    title: "Eligibility rules exclude repeat applicants",
    description:
      "Bonus point offers usually exclude existing or recent customers (12–24 month exclusion windows are common). Read the fine print before applying.",
  },
  {
    title: "Offers change without notice",
    description:
      "Earn rates, transfer rates, boosters and gift card discounts on this page are illustrative examples — always confirm on the provider's own site before acting.",
  },
  {
    title: "Use credit responsibly",
    description:
      "Points never beat interest. Only spend what you'd spend anyway and pay the balance in full every month — one month of interest can wipe out a year of rewards. Consider whether the product is right for your situation; this page is general information, not financial advice.",
  },
  {
    title: "Points have no guaranteed value",
    description:
      "Programs devalue points over time. Earn with a redemption in mind rather than hoarding indefinitely.",
  },
];

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <span
              aria-current="page"
              className="hidden h-8 items-center rounded-md bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-400 sm:inline-flex"
            >
              Resources
            </span>
            <Button asChild size="sm" variant="outline" className="bg-background">
              <Link href="/search">All stores</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Intro */}
        <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 shadow-sm sm:p-5">
          <div className="max-w-2xl">
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              <Sparkles className="size-3" />
              Points & rewards resources
            </Badge>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Earn more points,{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                stack more rewards
              </span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              The Australian rewards landscape in one place: where points come
              from, how the programs connect, and which member benefits unlock
              the gift card layer of your stack. Static guide — examples only.
            </p>
          </div>
        </div>

        {/* Resource sections */}
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.id} id={section.id} className="gap-0 py-0 shadow-sm">
              <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        section.iconClass
                      )}
                    >
                      <section.icon className="size-4.5" />
                    </span>
                    <CardTitle className="text-base leading-snug">
                      {section.title}
                    </CardTitle>
                  </div>
                  <Badge
                    variant="secondary"
                    className="hidden shrink-0 text-[10px] sm:inline-flex"
                  >
                    {section.badge}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex h-full flex-col p-4 sm:p-5">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {section.intro}
                </p>
                <ul className="mt-3 space-y-2.5">
                  {section.items.map((item) => (
                    <li key={item.title} className="flex gap-2">
                      <TicketPercent className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <p className="text-sm font-medium leading-snug">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {section.links.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                    {section.links.map((link) => (
                      <Button
                        key={link.href}
                        asChild
                        variant="outline"
                        size="sm"
                      >
                        <a
                          href={link.href}
                          target="_blank"
                          rel="nofollow noopener noreferrer"
                        >
                          {link.label}
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Warnings / disclaimers */}
        <Card className="mt-5 border-amber-500/25 bg-amber-500/5 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4.5" />
              </span>
              <CardTitle className="text-base">
                Read this before chasing points
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {warnings.map((warning) => (
                <li key={warning.title}>
                  <p className="text-sm font-medium">{warning.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {warning.description}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Footer disclaimer */}
        <p className="mt-6 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
          <strong>Disclaimer:</strong> Everything on this page is general
          information and illustrative example data, not financial advice and
          not live offers. Earn rates, bonuses, fees, transfer ratios and
          eligibility rules change frequently and vary by person — always
          verify with the bank, program or provider directly, and consider
          your own circumstances (or talk to a licensed adviser) before
          applying for credit products. DealStack AU is not affiliated with
          any program, bank or retailer mentioned.
        </p>
      </main>
    </div>
  );
}
