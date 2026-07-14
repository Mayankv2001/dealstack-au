import {
  BadgeCheck,
  CircleAlert,
  Lock,
  MapPin,
  ShieldCheck,
  Target,
  Users,
  Zap,
} from "lucide-react";
import type { PublicDeal, TrustStatus } from "@/lib/deals/types";
import { publicFreshness } from "@/lib/freshness";
import { cn } from "@/lib/utils";

/**
 * Honest user-facing status badges for the deal-card system. The primary
 * badge maps 1:1 from the record's TrustStatus; condition badges (membership,
 * activation, targeted, channel) render only when the underlying field says
 * so. Server-safe.
 */

const TRUST_BADGE: Record<
  TrustStatus,
  { label: string; icon: typeof ShieldCheck; className: string }
> = {
  verified: {
    label: "Retailer confirmed",
    icon: ShieldCheck,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  "source-checked": {
    label: "Specialist source confirmed",
    icon: BadgeCheck,
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  community: {
    label: "Community reported",
    icon: Users,
    className:
      "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  },
  expired: {
    label: "Source unavailable",
    icon: CircleAlert,
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function DealStatusBadge({
  trust,
  dealStackVerified = false,
  className,
}: {
  trust: TrustStatus;
  dealStackVerified?: boolean;
  className?: string;
}) {
  const badge =
    trust === "verified" && dealStackVerified
      ? { ...TRUST_BADGE.verified, label: "DealStack verified" }
      : trust === "verified"
        ? { ...TRUST_BADGE.verified, label: "Source confirmed" }
        : TRUST_BADGE[trust];
  const Icon = badge.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        badge.className,
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {badge.label}
    </span>
  );
}

export function isStalePrice(deal: PublicDeal, now: Date): boolean {
  return (
    publicFreshness(deal.lastCheckedAt ?? deal.postedAt, now).state ===
    "needs-recheck"
  );
}

/** Secondary condition badges — rendered only when the record says so. */
export function DealConditionBadges({
  deal,
  now = new Date(),
  className,
}: {
  deal: PublicDeal;
  now?: Date;
  className?: string;
}) {
  const conditions: { key: string; label: string; icon: typeof Lock }[] = [];
  if (deal.membershipRequired) {
    conditions.push({
      key: "membership",
      label: "Membership required",
      icon: Lock,
    });
  }
  if (deal.activationRequired) {
    conditions.push({ key: "activation", label: "Activate first", icon: Zap });
  }
  if (deal.targeted) {
    conditions.push({ key: "targeted", label: "Targeted offer", icon: Target });
  }
  if (deal.channelNote === "In-store") {
    conditions.push({ key: "channel", label: "In-store", icon: MapPin });
  }
  if (deal.trust !== "expired" && isStalePrice(deal, now)) {
    conditions.push({
      key: "stale",
      label: "Price may have changed",
      icon: CircleAlert,
    });
  }
  if (conditions.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {conditions.map(({ key, label, icon: Icon }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          <Icon aria-hidden className="size-3" />
          {label}
        </span>
      ))}
    </span>
  );
}
