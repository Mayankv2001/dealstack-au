import Link from "next/link";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import Logo from "@/components/Logo";

const EXPLORE_LINKS = [
  ["Deals", "/deals"],
  ["Stores", "/stores"],
  ["Gift-card deals", "/gift-cards"],
  ["Cashback", "/cashback"],
  ["Points", "/rewards"],
  ["Card offers", "/cards"],
] as const;

const TOOL_LINKS = [
  ["How stacking works", "/#how-it-works"],
  ["Gift-card guides", "/gift-cards/products"],
  ["Points valuations", "/rewards"],
  ["Compatibility rules", "/resources"],
  ["Expired offers", "/gift-cards/history"],
] as const;

const POLICY_LINKS = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Editorial policy", "/editorial-policy"],
] as const;

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <nav aria-label={title}>
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">
        {title}
      </h2>
      <ul className="mt-3 grid gap-2.5 text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link
              href={href}
              className="text-muted-foreground transition-colors hover:text-emerald-700"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-foreground/10 bg-card/80">
      <div className="page-container pb-28 pt-10 sm:py-14 lg:pb-14">
        <div className="grid gap-9 lg:grid-cols-[1.35fr_0.65fr_0.65fr]">
          <div className="max-w-lg">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              A clearer way to plan an Australian purchase. DealStack keeps
              checkout savings, later cashback and points separate, then shows
              the evidence behind each layer.
            </p>
            <Link
              href="/search"
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-emerald-700 px-5 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              <Search aria-hidden className="size-4" />
              Plan a purchase
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-8">
            <FooterLinks title="Explore" links={EXPLORE_LINKS} />
            <FooterLinks title="Tools" links={TOOL_LINKS} />
          </div>
          <div>
            <FooterLinks title="About" links={POLICY_LINKS} />
            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              Reviewed information, not financial advice. Always verify current
              terms with the retailer, provider or issuer before acting.
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} DealStack AU</p>
          <p>Independent from listed retailers, banks and rewards programmes.</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
