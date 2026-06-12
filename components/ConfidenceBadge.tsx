import { BadgeCheck, CircleAlert, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Confidence } from "@/lib/sources/types";
import { cn } from "@/lib/utils";

const CONFIDENCE_META: Record<
  Confidence,
  { label: string; icon: typeof BadgeCheck; className: string }
> = {
  confirmed: {
    label: "Confirmed",
    icon: BadgeCheck,
    className:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  "needs-verification": {
    label: "Needs verification",
    icon: CircleAlert,
    className:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  "expired-unknown": {
    label: "Expired / unknown",
    icon: CircleHelp,
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: Confidence;
  className?: string;
}) {
  const meta = CONFIDENCE_META[confidence];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 px-1.5 py-0 text-[10px]", meta.className, className)}
    >
      <meta.icon className="size-3" />
      {meta.label}
    </Badge>
  );
}

export default ConfidenceBadge;
