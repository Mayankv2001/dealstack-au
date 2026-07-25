# Phase 3 — Capacitor iOS shell

**Goal:** a runnable iOS app in the Simulator that loads the production site,
opens external links in Safari, and feels native (status bar, no bounce-scroll
chrome, back-swipe works).

**Precondition:** Phase 2 deployed to production. Phase 1 done far enough that
Xcode is installed (the paid account is NOT needed for Simulator work).

## Layout decision (decided)

The mobile shell lives at `mobile/` in this repo. It is its own npm workspace
(own `package.json`), **excluded from the Next.js build and from Vercel**:

- Add `mobile/` to the root `.vercelignore` (create the file if absent).
- Add `mobile/ios/App/Pods`, `mobile/ios/App/build`, `mobile/node_modules`,
  `mobile/ios/App/App/public` to `.gitignore`.
- Never import from `mobile/` in web code or vice versa.

## Step 1 — Scaffold

All commands inside `mobile/` with Node 20 (`nvm use 20`):

```bash
mkdir mobile && cd mobile
npm init -y
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli
npx cap init "DealStack AU" "<BUNDLE-ID>" --web-dir=www
mkdir www
```

Create `mobile/www/index.html` — a minimal offline fallback page (branded
emerald background, "You're offline — reconnect to browse deals", a Retry
button that calls `window.location.reload()`). This is what renders if the
remote site is unreachable at cold start. Keep it self-contained (inline CSS,
no external requests).

## Step 2 — capacitor.config.ts

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '<BUNDLE-ID>',
  appName: 'DealStack AU',
  webDir: 'www',
  server: {
    url: 'https://<PRODUCTION-DOMAIN>/?app=1',
    allowNavigation: ['<PRODUCTION-DOMAIN>'],
  },
  ios: {
    contentInset: 'never',
    appendUserAgent: 'DealStackApp/1.0',
  },
};

export default config;
```

Key points the executing model must not "improve":
- `appendUserAgent` is what Phase 2's middleware keys on. The string must be
  exactly `DealStackApp/1.0`.
- `allowNavigation` contains ONLY the production domain. Retailer/OzBargain
  links must NOT be added here — they open externally (Step 4).

## Step 3 — iOS project

```bash
npx cap add ios
npx cap sync ios
npx cap open ios   # opens Xcode
```

In Xcode (model can edit the files directly instead of clicking through UI —
they live under `mobile/ios/App/`):
- `Info.plist`: set `UIViewControllerBasedStatusBarAppearance` true; add
  `NSAppTransportSecurity` ONLY if the domain has TLS issues (it shouldn't —
  do not add ATS exceptions otherwise).
- Deployment target: iOS 15+ is fine (Capacitor default).
- Signing: Simulator needs none. Device/archive signing is Phase 6.

Install the standard plugins now (they're used in Phases 3–4):

```bash
npm install @capacitor/app @capacitor/browser @capacitor/status-bar \
  @capacitor/haptics @capacitor/share @capacitor/preferences @capacitor/network
npx cap sync ios
```

## Step 4 — Native glue script

The remote site can't import Capacitor's JS. Capacitor injects
`window.Capacitor` into the WebView automatically, and plugin bridges are
available at `window.Capacitor.Plugins.*`. Add a small glue file to the WEB
repo (this is a web-repo commit, standard checklist):

`public/app-shell.js`, loaded conditionally — add a `<Script>` (next/script,
`strategy="afterInteractive"`) in a small client component rendered by the
site header ONLY when `useIsAppShell()` is true. The script must:

1. **External links → system browser:** capture-phase `click` listener on
   `document`; if the resolved link host ≠ location.host, `preventDefault()`
   and call `Capacitor.Plugins.Browser.open({ url })` (falls back to
   `window.open` if `window.Capacitor` is absent).
2. **Android back / iOS handled natively — no work needed.**
3. **Status bar:** on load, `StatusBar.setStyle({ style: 'LIGHT' })` if the
   header is dark, else default. Match the real header colour.
4. Guard everything: the script must be a no-op when `window.Capacitor` is
   undefined (e.g. a normal browser user who somehow got the cookie).

## Step 5 — Run and verify (Simulator)

```bash
cd mobile && npx cap run ios    # or build/run from Xcode
```

Use the iOS Simulator tools to verify (screenshots as proof):
- [ ] App cold-starts into the live homepage; emerald theme intact; no white
      flash mismatch (set the WebView background colour in
      `capacitor.config.ts` → `backgroundColor` to the site's background).
- [ ] Content respects the notch (safe-area padding from Phase 2 active,
      because the user-agent triggered shell mode).
- [ ] Tapping a retailer/OzBargain link opens the in-app Safari view or
      external Safari — NOT in the WebView.
- [ ] Navigating `/deals`, `/gift-cards`, `/search` works; back-swipe gesture
      returns.
- [ ] Typing `<PRODUCTION-DOMAIN>/admin` cannot be reached through any UI, and
      if deep-linked, shows 404.
- [ ] Airplane-mode cold start shows the branded offline page (kill the app,
      enable airplane mode in Simulator via `xcrun simctl status_bar` or test
      by pointing config at an unreachable URL temporarily — restore after).

## Done when
- [ ] All Step 5 checks pass with screenshot evidence.
- [ ] `mobile/` committed (with the .gitignore entries — verify `git status`
      shows no Pods/build artefacts).
- [ ] Web-repo glue script committed behind the shell check; web checklist
      green; deployed.
