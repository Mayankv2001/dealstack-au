import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getGiftCardProgrammes } from "@/lib/repos";
import { formatDateAU } from "@/lib/sources/normalise";

export const metadata: Metadata = { title: "Ongoing gift-card programmes | DealStack AU", description: "Reviewed member catalogues and ongoing gift-card programme rates, kept separate from short-term promotions." };
export const revalidate = 300;

function rateValue(rate: Awaited<ReturnType<typeof getGiftCardProgrammes>>[number]["rates"][number]): string {
  if ((rate.discountPercent ?? 0) > 0) return `${rate.discountPercent}% off`;
  if ((rate.bonusPercent ?? 0) > 0) return `${rate.bonusPercent}% bonus value`;
  if ((rate.fixedDiscountDollars ?? 0) > 0) return `$${rate.fixedDiscountDollars} off${rate.thresholdDollars ? ` $${rate.thresholdDollars}` : ""}`;
  if (rate.promotionType === "fee-waiver") return rate.feeWaiverDollars ? `$${rate.feeWaiverDollars} fee waived` : "Fee waived";
  return "See reviewed terms";
}

export default async function GiftCardProgrammesPage() {
  const programmes = await getGiftCardProgrammes();
  return <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]"><SiteHeader /><main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"><h1 className="text-3xl font-bold tracking-tight">Ongoing member catalogues</h1><p className="mt-2 max-w-3xl text-muted-foreground">Programme rates are product-specific, account-gated and periodically reviewed. They are not short-term promotional offers.</p>{programmes.length === 0 ? <Card className="mt-7"><CardContent className="p-8 text-center"><h2 className="font-semibold">No programme catalogue is public yet</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">The separate local programme schema is prepared but not applied to production. Macquarie Marketplace and similar catalogues will appear only after each product rate, membership condition and review date is approved.</p></CardContent></Card> : <div className="mt-7 space-y-5">{programmes.map((programme) => <Card key={programme.id}><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{programme.provider}</p><h2 className="mt-1 text-xl font-semibold">{programme.name}</h2></div><span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-800">{programme.membershipRequired || programme.accountRequired ? "Membership/account required" : "Open eligibility"}</span></div>{programme.accountRequirement || programme.paymentRequirement ? <p className="mt-3 text-sm text-muted-foreground">{[programme.accountRequirement, programme.paymentRequirement].filter(Boolean).join(" · ")}</p> : null}<div className="mt-4 divide-y rounded-xl border">{programme.rates.map((rate) => <div key={rate.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-semibold">{rate.brandName}</p><p className="text-xs text-muted-foreground">{rate.membershipTier ?? rate.paymentRequirement ?? "Reviewed product rate"}</p></div><div className="text-right"><p className="font-semibold text-emerald-700">{rateValue(rate)}</p><p className="text-xs text-muted-foreground">Checked {formatDateAU(rate.lastCheckedAt.slice(0, 10))}</p></div></div>)}</div></CardContent></Card>)}</div>}</main><SiteFooter /></div>;
}
