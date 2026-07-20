import type { OfferWorkedExampleRow } from "@/lib/giftcards/offerWorkedExamples";

/**
 * Per-denomination comparison table for an offer spanning several card
 * products — server-rendered from reviewed product records only. The columns
 * keep cash and reward strictly separate: "You pay" includes any purchase fee
 * (also shown on its own), the reward is a disclosed estimate, and the net
 * figure can honestly go negative when a fee outweighs the reward.
 */

const aud = (n: number) =>
  n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export default function GiftCardDenominationExamples({
  rows,
}: {
  rows: OfferWorkedExampleRow[];
}) {
  if (rows.length === 0) return null;
  const anyFee = rows.some(
    (row) => row.purchaseFeeDollars > 0 || row.feeUnknown,
  );
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        Every eligible card and denomination, best value first. A fixed reward
        is worth the same on every card, so cheaper cards — and cards without a
        purchase fee — usually win.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Card
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Face value
              </th>
              {anyFee ? (
                <th scope="col" className="py-2 pr-3 font-medium">
                  Purchase fee
                </th>
              ) : null}
              <th scope="col" className="py-2 pr-3 font-medium">
                You pay
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Points
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Reward est.
              </th>
              <th scope="col" className="py-2 font-medium">
                Net benefit est.
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const net = row.netBenefitDollars;
              return (
                <tr
                  key={`${row.productId}-${row.denomination}`}
                  className="border-b last:border-b-0"
                >
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {row.productName}
                  </th>
                  <td className="py-2 pr-3">{aud(row.denomination)}</td>
                  {anyFee ? (
                    <td className="py-2 pr-3">
                      {row.feeUnknown
                        ? "Not recorded"
                        : row.purchaseFeeDollars > 0
                          ? aud(row.purchaseFeeDollars)
                          : "None"}
                    </td>
                  ) : null}
                  <td className="py-2 pr-3 font-semibold">
                    {aud(row.example.cashPaid)}
                  </td>
                  <td className="py-2 pr-3">
                    {row.example.points != null
                      ? row.example.points.toLocaleString("en-AU")
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {row.example.rewardValueDollars != null
                      ? `≈${aud(row.example.rewardValueDollars)}`
                      : "Not valued"}
                  </td>
                  <td
                    className={`py-2 font-semibold ${
                      net != null && net < 0
                        ? "text-destructive"
                        : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {net != null
                      ? `${net < 0 ? "−" : ""}≈${aud(Math.abs(net))}${net < 0 ? " (net cost)" : ""}`
                      : "Not valued"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Reward estimates use our published cents-per-point rate and are never
        deducted from what you pay at the register.
      </p>
    </div>
  );
}
