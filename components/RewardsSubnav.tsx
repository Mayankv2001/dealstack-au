import Link from "next/link";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { cn } from "@/lib/utils";

export function RewardsSubnav({ current }: { current?: string }) {
  const links = [
    { label: "All programs", href: "/rewards", slug: "all" },
    ...REWARDS_PROGRAMMES.map((programme) => ({
      label: programme.shortName,
      href: `/rewards/${programme.slug}`,
      slug: programme.slug,
    })),
  ];
  return (
    <nav aria-label="Points programmes" className="flex gap-1 overflow-x-auto border-b pb-2 [scrollbar-width:none]">
      {links.map((link) => {
        const active = (current ?? "all") === link.slug;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-emerald-700 text-white hover:bg-emerald-800 hover:text-white"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default RewardsSubnav;
