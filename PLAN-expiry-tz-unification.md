# PLAN-expiry-tz-unification — Kill the last two naive +10:00 expiry sites

> **Rank: 3 of 5 (fresh 2026-07-10 backlog).** The public-hardening phase (commits
> `5f952e7`/`59a754c`) unified expiry logic onto DST-correct AU-calendar
> helpers in `lib/offers/expiry.ts` — but deliberately exempted two files,
> recorded at the time as "next-phase candidates". This is that phase. The two
> survivors, verified still present 2026-07-10:
> - `lib/sources/normalise.ts:70` — `isExpired()` compares against
>   `T23:59:59+10:00`, so during **AEDT (first Sunday of October → first
>   Sunday of April, UTC+11)** search/source results stay "live" and keep
>   their stored confidence for an extra hour past AU midnight
>   (`deriveConfidence`, `lib/sources/ranking.ts:97–98` partition on it).
> - `lib/stack/compatibility.ts:67` — `expirySoonWarning()` uses the same
>   fixed offset **and** a millisecond window, so the stack engine can
>   disagree with the public deal cards: a card already shows "expiring soon"
>   via `isExpiringSoonAU` (calendar window) while the stack emits no warning
>   for the same offer on the same day.
> Zero live impact in July (AEST = +10, the offset happens to be right);
> real again every October. Small, pure-function change that closes the bug
> class and makes every expiry decision in the codebase agree.

## Goal

`isExpired` (sources) and `expirySoonWarning` (stack) delegate to the
canonical helpers in `lib/offers/expiry.ts` (`todayAU`, `isPastExpiry`,
`isExpiringSoonAU`), with unchanged signatures and unchanged caller code.
`EXPIRY_SOON_DAYS` gets a single source of truth. AEDT regression pins are
added so the fixed-offset pattern can't come back. After this,
`grep -rn "T23:59:59+10:00" lib` is empty.

## Non-goals

- **Do not touch `staleDataWarning`** (`compatibility.ts:79–93`) or
  `STALE_DATA_DAYS`: `lastCheckedAt` is a real timestamp, and millisecond
  arithmetic is *correct* there. `MS_PER_DAY` stays — it still serves that
  function.
- Do not change any caller (`lib/sources/ranking.ts`, `lib/stack/buildStack.ts`),
  any public repo/page, or any warning message text.
- Do not "fix" the `+10:00` literals in `lib/sources/manualData.ts` /
  `lib/offers/manualOffers.ts` — those are `lastCheckedAt` *data* values
  (valid ISO timestamps with explicit offsets), not logic.

## Preconditions

- `git pull --rebase`; clean tree; `nvm use 20`.
- Read fully before coding:
  - `lib/offers/expiry.ts` — the whole file (65 lines). Note the documented
    convention: offers stay live ON their expiry day; dates compare as
    YYYY-MM-DD strings via the `Australia/Sydney` `en-CA` formatter, never
    via `Date` parsing.
  - `lib/sources/normalise.ts:67–83` — `isExpired` + `deriveConfidence`.
  - `lib/stack/compatibility.ts:17–22, 58–93` — the constants and the two
    warning builders (one changes, one must not).
  - `tests/stack/expiryGuard.test.ts:76–90` — the existing AEDT regression
    pin for the shipped helper; your new pins copy its style.
  - `tests/monitor/normalise.test.ts:92–107` and
    `tests/stack/compatibility.test.ts:56–74` — the existing cases, all of
    which must keep passing UNMODIFIED (they encode the live-on-expiry-day
    convention, which the calendar compare preserves).

## Files to touch

| File | NEW/EDIT | Change |
|---|---|---|
| `lib/sources/normalise.ts` | EDIT | `isExpired` body → `isPastExpiry(result.expiryDate, todayAU(now))`; update its comment |
| `lib/stack/compatibility.ts` | EDIT | `expirySoonWarning` body → `isExpiringSoonAU`; `EXPIRY_SOON_DAYS` becomes a re-export of the expiry.ts constant |
| `tests/monitor/normalise.test.ts` | EDIT | Add AEDT pins (additive only) |
| `tests/stack/compatibility.test.ts` | EDIT | Add AEDT + calendar-boundary pins (additive only) |

## Step-by-step

### Step 1 — `lib/sources/normalise.ts`

Add `import { isPastExpiry, todayAU } from "@/lib/offers/expiry";` (no import
cycle: `expiry.ts` imports nothing; this file already uses `@/`-style paths
elsewhere in `lib`). Replace the body:

```ts
export function isExpired(result: DealSourceResult, now: Date): boolean {
  // Inclusive of the stated day, by AU-local calendar date (Australia/Sydney,
  // DST-correct) — same convention as the public read guard in lib/offers/expiry.
  return isPastExpiry(result.expiryDate, todayAU(now));
}
```

Signature identical; `isPastExpiry` handles `null`/`undefined` → `false`, so
the old `if (!result.expiryDate)` guard is subsumed. `deriveConfidence` and
`ranking.ts` need no changes.

### Step 2 — `lib/stack/compatibility.ts`

1. Replace the local constant (line 18) with a re-export so there is one
   source of truth (verified 2026-07-10: nothing outside this file imports
   the compatibility copy — only line 70 and a test comment reference it):
   ```ts
   import { EXPIRY_SOON_DAYS, isExpiringSoonAU } from "@/lib/offers/expiry";
   export { EXPIRY_SOON_DAYS };
   ```
2. Replace the `expirySoonWarning` body:
   ```ts
   export function expirySoonWarning(
     expiryDate: string | null,
     now: Date,
     label: string
   ): StackWarning | null {
     if (!isExpiringSoonAU(expiryDate, now, EXPIRY_SOON_DAYS)) return null;
     return {
       level: "caution",
       code: "expiry-soon",
       message: `${label} expires on ${expiryDate} — verify it is still live before relying on it.`,
     };
   }
   ```
   Message text byte-identical. `isExpiringSoonAU` returns `false` for null
   and for already-past dates, covering the old `!expiryDate` and `diff < 0`
   branches. The function stays pure and clock-injected (`now` is a
   parameter — the file's "no clock unless passed in" contract holds).
3. Update the doc comment on line 60 to say "within EXPIRY_SOON_DAYS AU-local
   calendar days". Leave `MS_PER_DAY` and `staleDataWarning` untouched.

### Step 3 — regression pins (additive; do not edit existing cases)

`tests/monitor/normalise.test.ts`, in the `isExpired` describe:
```ts
it("AEDT regression pin: expired at AU midnight, not at +10:00 midnight", () => {
  // 2026-01-15T13:30Z = 2026-01-16 00:30 AEDT (Sydney is UTC+11 in January).
  // The old fixed +10:00 end-of-day (13:59:59Z) said "still live" here.
  expect(isExpired(makeResult("2026-01-15"), new Date("2026-01-15T13:30:00Z"))).toBe(true);
});
it("AEDT: still live for the whole AU-local expiry day", () => {
  // 2026-01-15T12:59Z = 2026-01-15 23:59 AEDT — same calendar day, live.
  expect(isExpired(makeResult("2026-01-15"), new Date("2026-01-15T12:59:00Z"))).toBe(false);
});
```

`tests/stack/compatibility.test.ts`, in the `expirySoonWarning` describe:
```ts
it("AEDT regression pin: no warning for an offer already expired in AU time", () => {
  // Old code: end-of-day at +10:00 (13:59:59Z) > now (13:30Z) → warned on an
  // expired offer. Calendar compare: 2026-01-16 (AEDT today) > 2026-01-15 → null.
  expect(expirySoonWarning("2026-01-15", new Date("2026-01-15T13:30:00Z"), "X")).toBeNull();
});
it("warns across the full 7-calendar-day window (unified with public cards)", () => {
  // NOW is 2026-06-13 AU time; 2026-06-20 is exactly 7 calendar days out.
  // The old ms-window said null here while the public card already showed
  // "expiring soon" via isExpiringSoonAU — this pin locks the unification.
  expect(expirySoonWarning("2026-06-20", NOW, "X")).not.toBeNull();
});
```
(`NOW` already exists in that file: `2026-06-13T12:00:00+10:00`, line 17.)

### Step 4 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:monitor && npm run test:stack && npm run test:admin
grep -rn "T23:59:59+10:00" lib   # must print nothing
```

## Edge cases & traps

1. **Existing tests are the contract — they must pass unmodified.** Both
   existing `isExpired` cases (`normalise.test.ts:98–107`) and all four
   existing `expirySoonWarning` cases (`compatibility.test.ts:57–74`) use
   June dates (AEST, where +10:00 was accidentally correct) and boundary
   choices the calendar compare preserves. If one fails, your change broke
   the live-on-expiry-day convention — fix the code, never the test.
2. **The 7-day-boundary shift is intentional, not a bug.** With NOW mid-day
   on the 13th, expiry on the 20th now warns (calendar window, inclusive)
   where the old ms-window didn't (it needed `diff ≤ 7×24h` from
   end-of-expiry-day). This is exactly `isExpiringSoonAU`'s behaviour that
   public deal cards have shipped since `59a754c` — the point of the plan is
   that the stack agrees with the cards. The buildStack test comment at
   `tests/stack/buildStack.test.ts:137` (3 days ahead → warns) is unaffected.
3. **Pin tests with explicit `Z` instants.** January instants like
   `2026-01-15T13:30:00Z` are hermetic in any machine timezone because
   `todayAU` converts via the `Intl` formatter; writing pins with local or
   `+11:00` notation invites copy-paste drift. January is safely inside AEDT
   (Oct → Apr); do not pick early-October/April dates unless deliberately
   testing the transition.
4. **`staleDataWarning` is the trap for an over-eager refactor.** It sits
   next to `expirySoonWarning`, also does ms arithmetic, and is CORRECT —
   `lastCheckedAt` is a timestamp, not a calendar date. Leave it, and leave
   `MS_PER_DAY`.
5. **Import direction**: `lib/offers/expiry.ts` is dependency-free, so both
   new imports are cycle-safe. Do not move code the other way (e.g. moving
   `isExpired` into `expiry.ts`) — `DealSourceResult` would drag
   `lib/sources/types` into the shared module.
6. **`deriveConfidence` semantics sharpen for free**: at AU midnight during
   AEDT an expired result now correctly derives `expired-unknown` (and
   `rankResults` demotes it) instead of keeping stored confidence for an
   hour. No caller change needed — but it's why `test:monitor` matters here
   (`ranking.ts` is covered there).
7. **Signature stability**: `isExpired(result, now)` and
   `expirySoonWarning(expiryDate, now, label)` keep their exact signatures.
   `buildStack.ts` calls the latter at 4 sites with its injectable clock —
   purity and determinism of the stack tests depend on `now` staying a
   parameter, never `new Date()` inside.

## Acceptance criteria

- [x] `grep -rn "T23:59:59+10:00" lib` returns nothing (the two logic sites
      are gone; data-file `lastCheckedAt` literals in
      `manualData.ts`/`manualOffers.ts` are untouched and don't match this
      pattern).
- [x] `nvm use 20 && npm run lint && npm run build` pass.
- [x] `npm run test:monitor` and `npm run test:stack` pass with **zero
      modifications to pre-existing test cases** (additions only —
      `git diff tests/` shows only added lines), plus `test:admin` still
      green.
- [x] The four new pins pass: AEDT-midnight expiry (×2), AEDT no-warning on
      expired, 7-calendar-day unification.
- [x] `EXPIRY_SOON_DAYS` is defined once (`lib/offers/expiry.ts:42`) and
      re-exported by `compatibility.ts`; `grep -rn "EXPIRY_SOON_DAYS = 7" lib`
      matches exactly one line.
- [x] `staleDataWarning` and its tests are byte-identical
      (`git diff` shows no hunk touching it).
- [x] `git diff --stat` touches exactly the four listed files.

## Status: Shipped 2026-07-10

## Commit

```
Unify last two expiry checks onto DST-correct AU calendar helpers
```
Gate: lint + build + `test:monitor` (ranking/normalise changed) +
`test:stack` (stack logic changed) + `test:admin`. Only the four files
staged. Push to `origin/main` autonomously after `git pull --rebase`.
