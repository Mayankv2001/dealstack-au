import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GiftCardOfferCard from "@/components/GiftCardOfferCard";
import RewardsCalculator from "@/components/RewardsCalculator";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { findRewardsProgramme, REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { getGiftCardOffers, getPointsOffers } from "@/lib/repos";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { formatDateAU } from "@/lib/sources/normalise";
import { SOURCE_META } from "@/lib/sources/types";

export function generateStaticParams() {
  return REWARDS_PROGRAMMES.map((programme) => ({ slug: programme.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const programme = findRewardsProgramme((await params).slug);
  return programme ? { title: `${programme.name} offers and calculator | DealStack AU`, description: programme.description } : { title: "Rewards programme not found | DealStack AU" };
}

export const revalidate = 300;

export default async function RewardsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const programme = findRewardsProgramme((await params).slug);
  if (!programme) notFound();
  const [pointsOffers, giftCardOffers] = await Promise.all([getPointsOffers(), getGiftCardOffers()]);
  const needle = programme.shortName.toLowerCase();
  const activePoints = pointsOffers.filter((offer) => offer.program.toLowerCase().includes(needle));
  const activeGiftCards = giftCardOffers.filter((offer) => `${offer.pointsProgram ?? ""} ${offer.pointsOnPurchase?.program ?? ""}`.toLowerCase().includes(needle));
  return <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"><h1 className="text-3xl font-bold tracking-tight">{programme.name}</h1><p className="mt-3 max-w-3xl text-muted-foreground">{programme.description}</p><div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><RewardsCalculator programme={programme.name} defaultPointValueCents={programme.pointValueCents} /><Card><CardContent className="p-5"><h2 className="font-semibold">Before you claim</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{programme.claimChecks.map((check) => <li key={check}>{check}</li>)}</ul><p className="mt-4 text-xs leading-relaxed text-muted-foreground">{programme.transferNote}</p></CardContent></Card></div><section className="mt-10"><h2 className="text-xl font-bold">Current reviewed offers</h2>{activePoints.length + activeGiftCards.length === 0 ? <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No current reviewed {programme.shortName} offers. New offers appear only after approval.</p> : <><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeGiftCards.map((offer) => <GiftCardOfferCard key={offer.id} offer={offer} />)}</div>{activePoints.length > 0 ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{activePoints.map((offer) => <Card key={offer.id}><CardContent className="p-4"><h3 className="font-semibold">{offer.earnRateDisplay}</h3><p className="mt-1 text-sm text-muted-foreground">{offer.mechanism.replaceAll("-", " ")} · points are estimated, not cash</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Checked {formatDateAU(offer.lastCheckedAt.slice(0, 10))}</span>{offer.expiryDate ? <span>Ends {formatDateAU(offer.expiryDate)}</span> : null}</div>{offer.citations.length ? <div className="mt-3 flex flex-wrap gap-2">{offer.citations.flatMap((citation) => { const href = safeHttpsUrl(citation.sourceUrl); return href ? [<a key={`${citation.source}-${href}`} href={href} target="_blank" rel="nofollow noopener noreferrer" className="text-xs font-semibold text-emerald-700 hover:underline">Current {SOURCE_META[citation.source]?.displayName ?? citation.source} evidence</a>] : []; })}</div> : <p className="mt-3 text-xs text-amber-700">Current public source link is not recorded; verify before relying on this offer.</p>}</CardContent></Card>)}</div> : null}</>}</section><section className="mt-10 rounded-2xl border bg-card p-5"><h2 className="font-semibold">How to use this programme safely</h2><ol className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><li>1. Confirm the membership account is linked before purchase.</li><li>2. Activate targeted boosts before the stated deadline.</li><li>3. Check excluded products, transaction limits and credit timing.</li><li>4. Keep estimated rewards separate from cash paid.</li></ol></section></main><SiteFooter /></div>;
}
