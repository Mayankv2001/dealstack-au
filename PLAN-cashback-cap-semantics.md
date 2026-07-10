> **STATUS (2026-07-10): SHIPPED in `c6e31ed` — do not re-execute.**
> Kept for reference. Verify with `git log --oneline | grep c6e31ed`.

# PLAN: Fix cashback cap maths — the engine understates capped cashback ~10×

> **Rank: 2 of 5. Highest product-correctness impact in this batch.** The
> stack engine treats `capDollars` as a cap on **eligible spend** for BOTH
> layers (`cappedSaving` in `lib/stack/buildStack.ts:113-120` computes
> `min(base, cap) × pct`). That is correct for the gift-card layer (every
> seeded gift-card cap reads "up to $X per order") but wrong for cashback,
> where the admin form's own hint says the field is a **"per-offer cashback
> cap"** — i.e. a cap on the *cashback dollars*. Worked example: ShopBack
> 10% capped at $25 on a $500 basket → engine shows `min(500, 25) × 10% =
> $2.50`; the true saving is `min($50, $25) = $25`. Ten-fold understatement
> of the flagship number on `/deals`, store pages, and Smart Stack the
> moment an admin fills in that form field. The mismatch is already pinned
> by a characterization test that says "flagged for a product decision"
> (`tests/stack/buildStack.test.ts:127-149`) — this plan IS that decision:
> **cashback caps cap the saving; gift-card caps cap the eligible spend.**

## Prerequisites

- `PLAN-deterministic-test-clock.md` landed first (this plan edits the same
  test file and its acceptance depends on a green baseline).
- `nvm use 20`; read `AGENTS.md`.
- Read fully before coding:
  - `lib/stack/buildStack.ts` — `cappedSaving` (:113), its two call sites
    (:169-174), the conflict-resolution block (:176-186), the gift-card
    `capReachedWarning` call (:221-226). Note there is NO cap warning on
    the cashback branch today.
  - `lib/stack/compatibility.ts` — `capReachedWarning` (:125-137).
  - The evidence for per-layer semantics:
    - Gift-card seeds: `lib/offers/manualOffers.ts` — `gc-tcn-jbhifi`
      (`capDollars: 500`, `limitPerCustomer: "Up to $500 per order"`),
      `gc-coles-group-bonus-points` (`capDollars: 200`, "Bonus on up to
      $200 in gift cards"), `gc-apple-points`, `gc-restaurant-cafe-choice`.
      All four are **spend** caps.
    - Cashback form: `components/admin/CashbackForm.tsx:229-233` — "Cap ($)
      … Optional per-offer cashback cap" — a **saving** cap. (Real AU portal
      terms are phrased "capped at $30 cashback".)
  - `tests/stack/buildStack.test.ts:127-149` — the characterization test
    you will replace.

## Goal

`capDollars` means what each layer's real-world terms mean:

- **Cashback** (`CashbackOffer.capDollars`): maximum cashback **dollars**
  for the transaction. Saving = `min(checkoutPrice × rate%, capDollars)`.
  A binding cap emits a `cap-reached` warning.
- **Gift card** (`GiftCardOffer.capDollars`): maximum **spend** the
  discount applies to per order. Saving = `min(checkoutPrice, capDollars)
  × discount%` — the current behaviour, kept, now with accurate wording.

No schema change, no migration, no UI redesign — the numbers and warning
text change, nothing else.

## Exact files to touch

| File | Change |
|---|---|
| `lib/offers/types.ts` | Doc comments on both `capDollars` fields stating the per-layer semantics |
| `lib/stack/buildStack.ts` | Split `cappedSaving` into two explicit helpers; add cashback cap warning call |
| `lib/stack/compatibility.ts` | Reword gift-card cap message; add cashback cap warning builder |
| `components/admin/CashbackForm.tsx` | Unambiguous hint: cap on cashback dollars |
| `components/admin/GiftCardForm.tsx` | Unambiguous hint: cap on eligible spend per order |
| `tests/stack/buildStack.test.ts` | Replace the characterization test; add binding/non-binding cases per layer |
| `tests/stack/compatibility.test.ts` | Cover the new warning builder |

## Step-by-step implementation order

### Step 1 — pin the semantics in `lib/offers/types.ts`

- `GiftCardOffer.capDollars` (line ~53): change the comment to
  `/** Max SPEND the discount applies to per order/transaction (e.g. "up to $500 of gift cards"); null = uncapped. */`
- `CashbackOffer.capDollars` (line ~82): add
  `/** Max cashback DOLLARS for one transaction (e.g. "capped at $30"); null = uncapped. */`

### Step 2 — `lib/stack/compatibility.ts`

1. Reword `capReachedWarning` (the gift-card/spend one) so the message
   matches spend-cap semantics, keeping the same `code: "cap-reached"` and
   `level: "caution"`:
   `` `${label} only applies to the first $${capDollars} of spend — savings above that do not apply.` ``
2. Add a sibling builder (same shape, same code):

```ts
/** Cashback cap: fires when the UNCAPPED saving exceeds the dollar cap. */
export function cashbackCapReachedWarning(
  capDollars: number | null,
  rawSavingDollars: number,
  label: string
): StackWarning | null {
  if (capDollars === null) return null;
  if (rawSavingDollars <= capDollars) return null;
  return {
    level: "caution",
    code: "cap-reached",
    message: `${label} is capped at $${capDollars} — cashback above the cap does not accrue.`,
  };
}
```

Reuse the existing `"cap-reached"` member of `StackWarningCode` — do NOT
add a new code (UI and tests key on the code generically).

### Step 3 — `lib/stack/buildStack.ts`

1. Replace `cappedSaving` with two explicitly-named helpers:

```ts
/** Gift-card layer: capDollars caps the ELIGIBLE SPEND ("up to $X per order"). */
function spendCappedSaving(base: number, percent: number, capDollars: number | null): number {
  const eligible = capDollars === null ? base : Math.min(base, capDollars);
  return eligible * (percent / 100);
}

/** Cashback layer: capDollars caps the SAVING ITSELF ("capped at $X cashback"). */
function dollarCappedSaving(base: number, percent: number, capDollars: number | null): number {
  const raw = base * (percent / 100);
  return capDollars === null ? raw : Math.min(raw, capDollars);
}
```

2. Call sites (:169-174): `giftCardSaving` → `spendCappedSaving(...)`;
   `cashbackSaving` → `dollarCappedSaving(...)`. Keep the surrounding
   `round(...)` exactly where it is.
3. In the `useCashback && cashback` branch (after the existing
   `cbVerify` block, ~:267), add the missing warning:

```ts
const cbCap = cashbackCapReachedWarning(
  cashback.capDollars,
  checkoutPrice * (cashback.ratePercent / 100), // raw, UNCAPPED saving
  `The ${cashback.provider} cashback offer`
);
if (cbCap) warnings.push(cbCap);
```

4. The gift-card warning call (:221-226) stays passing `checkoutPrice` —
   correct for a spend cap. Do not change it beyond the Step 2 rewording.

### Step 4 — admin form hints

- `CashbackForm.tsx` "Cap ($)" hint →
  `"Maximum cashback dollars for one transaction (e.g. enter 30 for 'capped at $30 cashback'). Leave blank when uncapped."`
- `GiftCardForm.tsx` "Cap ($)" hint →
  `"Maximum spend the discount applies to per order (e.g. enter 500 for 'up to $500 of gift cards'). Leave blank when uncapped."`

### Step 5 — tests

In `tests/stack/buildStack.test.ts`:

1. DELETE the characterization test
   (`"currently treats capDollars as an eligible-spend cap"`) including its
   explanatory comment block — its whole purpose was to hold this decision
   open.
2. Add, using the existing factories (spend defaults to 500 via the second
   arg):
   - **Cashback cap binds**: `makeCashback({ ratePercent: 10, capDollars: 25 })`,
     no gift card → cashback component `valueDollars` = 25,
     `effectivePrice` = 475, one `cap-reached` warning.
   - **Cashback cap slack**: `capDollars: 100` → `valueDollars` = 50, NO
     `cap-reached` warning.
   - **Gift-card spend cap (behaviour preserved)**: keep the old numbers —
     `makeGiftCard({ discountPercent: 10, capDollars: 200, acceptedAtMerchantIds: ["myer"] })`
     → `valueDollars` = 20 and a `cap-reached` warning (this is the old
     characterization expectation, now asserted as *intended*).
   - **Conflict resolution uses the corrected numbers**: gift card 5%
     uncapped ($25) vs cashback 10% capped at $30 with
     `excludesGiftCardPayment: true` → raw cashback $50 caps to $30, so
     **cashback wins** ($30 > $25): gift card `optional: true`, cashback
     kept, `effectivePrice` = 470. (Under the old maths cashback would have
     been `min(500,30)×10% = $3` and lost — this test is the regression
     tripwire for the whole fix.)

In `tests/stack/compatibility.test.ts`: `cashbackCapReachedWarning` returns
null for null cap, null when raw ≤ cap, warning (level caution, code
`cap-reached`) when raw > cap.

### Step 6 — verify

```bash
npm run test:stack && npm run test:monitor && npm run test:admin
npm run lint && npm run build
```

Then eyeball `/deals` (`npm run dev`, static fallback is fine): the seeded
data has NO capped cashback rows, so the visible numbers should be
**unchanged** — confirming the fix is dormant until a capped cashback offer
exists.

## Edge cases a weaker model would miss

1. **Do not "fix" both layers to `min(raw, cap)`.** The gift-card seeds
   prove gift-card caps are spend caps; flattening both would turn "up to
   $200 in gift cards" into "$200 off" and corrupt the other half of the
   engine. The layers genuinely differ — that is the whole finding.
2. **The conflict-resolution winner can flip.** `giftCardSaving >=
   cashbackSaving` (:180) now compares correctly-capped values; a capped
   cashback that used to lose absurdly may now win. That is the *fix
   working* — pin it with the conflict test above, don't "restore" old
   winners.
3. **Warning input must be the RAW saving for cashback.** Passing the
   already-capped saving makes `raw <= cap` always true and the warning
   dead. Symmetrically, don't pass the raw saving to the gift-card
   (spend-cap) warning — that one correctly compares `checkoutPrice`.
4. **`capDollars: 0` is a real value, not "no cap".** The admin actions
   parse blank → `null` (`parseOptionalAmount`,
   `app/admin/(protected)/cashback/actions.ts:41-50`), so a stored 0 was
   typed deliberately. `min(raw, 0) = 0` — render the honest $0 and let the
   warning fire; do not coerce 0 to null.
5. **`CashbackOffer.flatAmount` is stored but consumed nowhere in the
   engine.** Leave it alone — wiring flat-dollar bonuses into the stack is
   a separate feature, not a drive-by. Note it as a known non-goal.
6. **`lib/calculateStack.ts` (homepage/store-page quick calculator) has no
   cap fields at all** — by design, the flat `Store` model carries no caps.
   Do not try to add caps there; the disclaimer copy already covers it.
7. **The `weekly stack` numbers on `/deals`, Smart Stack results on
   `/search`, and store pages all flow from this one engine** — no separate
   fix needed anywhere else, but expect their displayed values to change
   whenever a capped cashback row exists.
8. **Prod data audit after deploy** (semantics of already-entered caps):
   `select id, merchant_id, provider, rate_percent, cap_dollars from
   cashback_offers where cap_dollars is not null;` — every returned row was
   entered under the ambiguous old hint; re-verify each against the
   provider's current terms. Seeded/demo cashback rows all have
   `capDollars: null`, so the expected result is zero rows.
9. **Keep `round()` at the call sites, min() inside the helpers** — moving
   rounding inside changes cent-level results and breaks the exact-dollar
   test expectations for no reason.

## Acceptance criteria

- [ ] Cashback 10% + cap $25 + $500 checkout → component `valueDollars`
      **25** (was 2.50), `cap-reached` warning present; cap $100 →
      `valueDollars` 50, no warning. Pinned by tests.
- [ ] Gift card 10% + cap $200 + $500 checkout → `valueDollars` **20**
      (unchanged from before this plan), warning present. Pinned by test.
- [ ] Conflict test proves a capped cashback now competes with its true
      value (cashback $30 beats gift card $25).
- [ ] The characterization test and its "flagged for a product decision"
      comment are gone; `grep -n "eligible-spend cap" tests/` → no hits.
- [ ] Both admin form hints state the layer's semantics with an example;
      Australian spelling throughout.
- [ ] `grep -n "cappedSaving" lib/` → no hits (replaced by the two named
      helpers).
- [ ] All suites + `npm run lint` + `npm run build` pass (Node 20).
- [ ] With current seed data (no capped cashback rows), `/deals` renders
      identical numbers to before the change.
