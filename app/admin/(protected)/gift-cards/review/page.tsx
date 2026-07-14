import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listGiftCardCandidates,
  listPublishedOfferSummaries,
  getGiftCardSource,
} from "@/lib/admin/repos/giftCardPipeline";
import { listStores } from "@/lib/admin/repos/stores";
import { Button } from "@/components/ui/button";
import { GiftCardReviewCard } from "@/components/admin/GiftCardReviewCard";
import { findDuplicateOffers } from "@/lib/giftcards/duplicateDetection";
import { WeeklyGiftCardSubmissionForm } from "@/components/admin/WeeklyGiftCardSubmissionForm";
import { POINT_HACKS_WEEKLY_SOURCE_ID } from "@/lib/giftcards/pointHacksWeekly";

/**
 * Gift-card candidate review queue — the human gate between the GCDB ingest
 * and the public gift_card_offers table. Shows the raw source item beside the
 * extracted fields; every normalised value is editable before approval, and
 * changed items carry a field-level diff. Nothing auto-approves.
 */

export const metadata: Metadata = {
  title: "Gift card review | DealStack AU admin",
};

export default async function GiftCardReviewPage() {
  await requireAdmin();
  const [candidates, stores, publishedOffers, weeklySource] = await Promise.all([
    listGiftCardCandidates(),
    listStores(),
    listPublishedOfferSummaries(),
    getGiftCardSource(POINT_HACKS_WEEKLY_SOURCE_ID),
  ]);
  const storeOptions = stores.map((s) => ({ id: s.id, name: s.name }));
  const today = new Date().toISOString().slice(0, 10);
  const duplicatesByCandidate = new Map(
    candidates.map((candidate) => [
      candidate.id,
      findDuplicateOffers(
        {
          sellerName: candidate.sellerName,
          giftCardBrands: candidate.giftCardBrands,
          promotionType: candidate.promotionType,
          discountPercent: candidate.discountPercent,
          bonusPercent: candidate.bonusPercent,
          pointsMultiplier: candidate.pointsMultiplier,
          fixedPoints: candidate.fixedPoints,
          pointsProgram: candidate.pointsProgram,
          denominationNote: candidate.terms.weeklyFacts?.variableLoadRange
            ? `$${candidate.terms.weeklyFacts.variableLoadRange.min}–$${candidate.terms.weeklyFacts.variableLoadRange.max} variable load`
            : candidate.terms.weeklyFacts?.denominations
                .map((value) => `$${value}`)
                .join(", ") || null,
          startsAt: candidate.startsAt,
          expiresAt: candidate.expiresAt,
          sourceUrl: candidate.sourceUrl,
        },
        publishedOffers,
        today
      ),
    ])
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">
            Gift card review queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Candidates staged by approved source pipelines or structured admin
            capture. Nothing is public until you approve it here; edited values
            win over parser output.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/gift-cards">Published offers</Link>
        </Button>
      </header>

      <WeeklyGiftCardSubmissionForm
        sourceInstalled={weeklySource != null}
        automatedFetchAllowed={
          weeklySource?.enabled === true &&
          weeklySource.automated_fetch_allowed === true &&
          Boolean(weeklySource.terms_checked_at) &&
          Boolean(weeklySource.robots_checked_at)
        }
        lastSuccessAt={weeklySource?.last_success_at ?? null}
        lastFailureAt={weeklySource?.last_error_at ?? null}
        lastFailure={weeklySource?.last_error ?? null}
      />

      <datalist id="store-ids">
        {storeOptions.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </datalist>

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Inbox aria-hidden className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No gift-card candidates await review. The ingest stages new and
            changed source items here when it runs (or when triggered with
            ?force=1).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => (
            <GiftCardReviewCard
              key={candidate.id}
              candidate={candidate}
              stores={storeOptions}
              duplicates={duplicatesByCandidate.get(candidate.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
