# Phase 1 — Prerequisites (human-only)

**Who does this:** the user (Mayank). A model cannot do any of these — they
require payment, identity verification, and Apple account access. The model's
only job in this phase is to present this checklist to the user and record the
resulting values in `docs/appstore/CONFIG.md`.

**Model: never enter Apple credentials, payment details, or two-factor codes
anywhere. If a step appears to need that, hand it back to the user.**

## Checklist

### 1. Apple Developer Program membership
- Enrol at https://developer.apple.com/programs/enroll/ with an Apple ID.
- Cost: **US$99/year** (charged in AUD equivalent). Individual enrolment is
  fine; "Organisation" enrolment needs an ABN + D-U-N-S number and takes weeks —
  only choose it if DealStack must be published under a company name.
- Approval usually takes 24–48 hours.
- **Record:** Apple Team ID (Membership page → Team ID, 10 characters) →
  `<APPLE-TEAM-ID>`.

### 2. Mac + Xcode
- A Mac running a macOS version that supports the current Xcode (this project
  machine is on Darwin 25 / macOS 26-era — fine).
- Install **Xcode from the Mac App Store** (not just Command Line Tools). ~40 GB
  free disk needed. Open it once and accept the licence.
- Install the iOS platform when Xcode prompts (Settings → Components).
- Verify: `xcodebuild -version` prints a version; `xcrun simctl list devices`
  lists iPhone simulators.

### 3. App Store Connect app record
Do this **after** enrolment is approved, ideally after Phase 3 exists so the
bundle ID is settled:
- At https://developer.apple.com/account → Identifiers → register an App ID
  with bundle ID `<BUNDLE-ID>` (recommend `au.com.dealstack.app`; explicit, not
  wildcard). Capabilities: leave defaults; add Push Notifications only if
  Phase 4's optional push step is attempted.
- At https://appstoreconnect.apple.com → My Apps → "+" → New App:
  - Platform: iOS. Name: `<APP-NAME>` (e.g. "DealStack AU" — names are globally
    unique; have a fallback like "DealStack Australia").
  - Primary language: English (Australia). Bundle ID: the one just registered.
  - SKU: any stable string, e.g. `dealstack-au-ios-1`.

### 4. Decisions to record in CONFIG.md
- `<PRODUCTION-DOMAIN>` — which URL the app shell loads. Must be the production
  deployment, HTTPS, stable.
- Age rating: the app is deal listings — expect 4+.
- Pricing: Free.
- Availability: Australia only, or worldwide? (Content is AU-specific;
  Australia-only is the sensible default.)

## Done when
- [ ] Developer Program active (Team ID visible).
- [ ] Xcode installed; `xcodebuild -version` works.
- [ ] `docs/appstore/CONFIG.md` created with `<APPLE-TEAM-ID>`, `<BUNDLE-ID>`,
      `<PRODUCTION-DOMAIN>`, `<APP-NAME>` filled in (model writes it from the
      user's answers).
- [ ] App Store Connect record can wait until Phase 6, but the App ID/bundle ID
      must exist before Phase 6's archive step.
