import Link from "next/link";
import Logo from "@/components/Logo";

const PRODUCT_LINKS = [
  ["Stores", "/stores"],
  ["Deals", "/deals"],
  ["Card offers", "/cards"],
  ["Gift cards", "/gift-cards"],
  ["Gift-card directory", "/gift-cards/products"],
  ["Rewards", "/rewards"],
  ["Resources", "/resources"],
] as const;

const POLICY_LINKS = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Editorial policy", "/editorial-policy"],
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-[1fr_auto_auto]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Independent deal-stacking research. Offers can change without
              notice; verify current terms with the retailer, provider or
              issuer before acting.
            </p>
          </div>
          <nav aria-label="Product" className="grid content-start gap-2 text-sm">
            {PRODUCT_LINKS.map(([label, href]) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Policies" className="grid content-start gap-2 text-sm">
            {POLICY_LINKS.map(([label, href]) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-6 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            General information only, not financial advice. DealStack AU is
            not affiliated with listed retailers, rewards programmes, banks or
            card issuers unless explicitly disclosed.
          </p>
          <p className="mt-2">© {new Date().getFullYear()} DealStack AU</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
