# Phase 4 — Native features (the Guideline 4.2 defence)

**Goal:** enough genuinely native behaviour that App Review cannot call this
"just a website". Apple's Guideline 4.2 (Minimum Functionality) is the single
biggest rejection risk for this architecture. This phase is NOT optional.

Every feature below degrades gracefully on the normal website (no-op or web
fallback). Web-repo changes follow the standard commit checklist; run
`npx cap sync ios` in `mobile/` after any plugin change.

## Feature 1 — Saved deals with offline access (required)

The core native-value feature: users save deals; saved deals are readable
offline.

1. **Web repo:** add a "Save" control (bookmark icon) on deal/offer cards and
   detail views — **app shell only** (`useIsAppShell()`); the public website is
   unchanged. Reuse existing card components; additive UI only.
2. Storage: `Capacitor.Plugins.Preferences` (key `saved_deals`, JSON array of
   `{id, title, store, discountText, url, savedAtISO}`) — written via the glue
   layer in `public/app-shell.js` (extend it with a tiny
   `window.DealStackNative.saveDeal/removeDeal/listDeals` API; keep it under
   ~100 lines, no framework).
3. **Saved screen:** a new route `app/(public)/saved/page.tsx` that renders from
   the native-stored list client-side. In the app shell's offline state, the
   shell's fallback page (Phase 3) gains a "Saved deals" button that renders the
   Preferences data — this is what makes saves readable with no network.
   Simplest compliant implementation: render saved deals directly in
   `mobile/www/index.html` from Preferences; the online `/saved` route reads the
   same data via the glue API.
4. Nav entry "Saved" appears in the header only in shell mode.

## Feature 2 — Native share sheet (required, small)

On deal cards/detail (shell mode only): a share icon calling
`Capacitor.Plugins.Share.share({ title, url })` with the canonical
`<PRODUCTION-DOMAIN>` deal URL. Fallback to the Web Share API
(`navigator.share`) so the code path is testable in a browser.

## Feature 3 — Haptics (required, trivial)

In the glue script: light impact (`Haptics.impact({ style: 'LIGHT' })`) on
save/unsave and on pull-to-refresh completion. Nothing else — do not sprinkle
haptics on every tap.

## Feature 4 — Pull-to-refresh (required)

WKWebView doesn't give this for free on a remote URL. Implement in the glue
script: a touch-driven pull indicator at scroll-top that triggers
`window.location.reload()` past a 70px threshold. Keep it CSS-transform based,
~80 lines, shell-mode only. (If a maintained Capacitor community plugin for
native pull-to-refresh is available and current, prefer it — check, don't
assume.)

## Feature 5 — Home-screen quick actions (required, small)

`@capacitor/app` doesn't do this; use the App Shortcuts via `Info.plist`
static `UIApplicationShortcutItems`: "Today's deals" → `/deals?app=1`,
"Gift cards" → `/gift-cards?app=1`, "Search" → `/search?app=1`. Handle the
shortcut in `AppDelegate.swift` by loading the target URL in the Capacitor
WebView (Capacitor's `App.addListener('appUrlOpen')` pattern; follow current
Capacitor iOS docs).

## Feature 6 — Push notifications (OPTIONAL — attempt only if the user asks)

Deal-alert pushes are the strongest 4.2 defence but need sending
infrastructure (APNs keys, a send pipeline, topic management) that clashes
with the Vercel-Hobby/one-cron constraint. **Default: skip.** If the user
opts in, plan it as its own phase: APNs key in Apple Developer portal,
`@capacitor/push-notifications`, and a manual admin-triggered send script —
never an autonomous publisher (repo safety rules).

## Anti-patterns (do not do these)

- Do not add a native tab bar or duplicate navigation — the site header is the
  navigation; two navs is worse than one.
- Do not cache/mirror the whole site for offline; only saved deals.
- Do not add Supabase access from the shell or glue script.
- Do not gate existing web features behind the app.

## Verify

- Simulator run-through with screenshots: save a deal → appears in Saved →
  airplane mode → cold start → saved deals still readable → share sheet opens
  → quick actions from home screen long-press work.
- Regression: normal browser (no shell cookie) shows no Save/Share/Saved nav,
  and `npm run test:e2e` stays green.
- Add e2e: `/saved` route renders empty-state OK in a plain browser.

## Done when
- [ ] Features 1–5 implemented, verified in Simulator with screenshots.
- [ ] Website unchanged for non-app users (e2e green).
- [ ] Web + mobile commits pushed; production deployed.
