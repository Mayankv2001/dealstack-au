import type { Metadata } from "next";
import PredictionCaptureForm from "@/components/admin/PredictionCaptureForm";
import PredictionReviewForm from "@/components/admin/PredictionReviewForm";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin/auth";
import { listPredictions } from "@/lib/admin/repos/giftCardPredictions";

export const metadata: Metadata = { title: "Gift-card predictions | DealStack AU admin" };
export const dynamic = "force-dynamic";

export default async function PredictionReviewPage() {
  await requireAdmin();
  const result = await listPredictions();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Gift-card prediction review</h1>
        <p className="mt-1 text-sm text-muted-foreground">Compare private predictions with confirmed outcomes.</p>
      </header>
      <div role="status" className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm font-semibold">
        Predictions are private analysis records and are never publishable. This page has no publish action.
      </div>
      <PredictionCaptureForm disabled={!result.available} />
      {!result.available ? (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Migration 029 is not available. No prediction records can be reviewed.</p>
      ) : result.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No private predictions recorded.</p>
      ) : (
        <div className="space-y-3">
          {result.rows.map((prediction) => (
            <article key={prediction.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold">{prediction.predictedSeller ?? "seller not recorded"} · {prediction.predictedFamilies.join(", ") || "family not recorded"}</h2><p className="text-xs text-muted-foreground">{prediction.predictedPromotionType ?? "type not recorded"} · {prediction.predictedValue ?? "value not recorded"} · {prediction.predictedStartsAt ?? "start unknown"}–{prediction.predictedEndsAt ?? "end unknown"}</p>{prediction.predictedPromotionText ? <p className="mt-1 text-xs text-muted-foreground">Captured prediction: {prediction.predictedPromotionText}</p> : null}{prediction.sourceMarker ? <p className="mt-1 text-xs font-medium text-amber-700">Source marker (uninterpreted): {prediction.sourceMarker}</p> : null}</div>
                <Badge variant="secondary">{prediction.status}</Badge>
              </div>
              <PredictionReviewForm prediction={prediction} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
