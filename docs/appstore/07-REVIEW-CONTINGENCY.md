# Phase 7 — Review rejection contingency playbook

**Use only if App Review rejects.** Read the rejection message carefully; Apple
cites specific guideline numbers. Match them below. Always respond in the
Resolution Center politely and factually; never argue about policy.

## 4.2 Minimum Functionality ("your app is primarily a website")

The expected risk. Escalating responses, in order — stop at the first that
succeeds:

1. **Reply, don't rebuild.** In Resolution Center, enumerate the native
   features with a short screen-recording: offline saved deals, share sheet,
   quick actions, haptics, pull-to-refresh, domain-locked navigation. Many 4.2
   flags are resolved by demonstrating what the reviewer missed.
2. **Add push notifications** (Phase 4 Feature 6, previously skipped). Deal
   alerts are the canonical 4.2 cure. Requires APNs setup and an
   admin-triggered send path — scope it as a full phase; keep the repo's
   "no autonomous publishing" rule (a human triggers every send).
3. **Add an iOS widget** (WidgetKit extension in Swift showing top 3 current
   deals from a small public JSON endpoint — this would need a new read-only
   API route in the web repo, e.g. `app/api/widget/top-deals/route.ts`, cached,
   no secrets). Bigger job; only if 1–2 fail.
4. If Apple still refuses, stop and discuss with the user; do not keep
   resubmitting the same build (repeated rejections risk the account).

## 5.1.1 / 5.1.2 Privacy

- Mismatch between nutrition labels and observed traffic: re-audit what the
  WebView actually loads (Vercel Analytics, any third-party scripts), fix the
  labels or strip the tracker from shell mode, resubmit.
- Missing/inadequate privacy policy: update `/privacy` on the site (user
  approves copy), no new build needed — the policy is a URL.

## 4.0 / Design complaints (safe areas, broken layout on a specific device)

- Reproduce in Simulator on the named device size; fix in web CSS (deploys
  without a new binary) unless it's splash/status-bar related (then new build,
  bump build number).

## 2.1 App Completeness (crash or blank screen for the reviewer)

- Almost always: the remote site was slow/unreachable, or a geo/CDN issue from
  Apple's review network (California). Checks: is the offline fallback
  rendering instead of the site? Does `<PRODUCTION-DOMAIN>` load from a US
  VPN? Is Vercel Hobby hitting limits? Fix availability, verify from a US
  vantage point, resubmit with a note.

## 4.3 Spam / duplicate

- Unlikely (original content). If cited, respond documenting that DealStack is
  the developer's own service with its own data pipeline.

## 5.2.x Intellectual property

- If Apple queries retailer names/logos: DealStack lists factual offer data and
  links out; remove any retailer logos we don't have rights to (check the
  stores UI — if it renders third-party logos, be ready to switch to text
  names in shell mode) and state the factual-listing basis in the reply.

## Guideline 4.2.3 ("app must work without requiring another app/website first")

- Ensure first-run works with zero setup: no onboarding that links out, no
  "visit our website to continue". The app already meets this; if cited,
  demonstrate with a recording.

## Process rules

- Every resubmission: increment build number, note what changed in the
  "What's New for Review" notes.
- Log each rejection + response in `docs/appstore/review-log.md` (create on
  first use) so later attempts don't repeat failed arguments.
- Never modify server behaviour to detect and special-case Apple's review
  traffic — that is exactly the deceptive pattern that gets accounts banned.
