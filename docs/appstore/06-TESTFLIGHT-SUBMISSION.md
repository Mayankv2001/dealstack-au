# Phase 6 — TestFlight and submission

**Goal:** signed build on TestFlight, human smoke-test on a real iPhone, then
submit for review.

**Split of labour:** the model prepares the project and can drive `xcodebuild`;
every step that needs the user's Apple ID login, 2FA, or agreement acceptance
is the human's. The model never handles Apple credentials (hard rule).

## Step 1 — Version and build settings (model)

In `mobile/ios/App/`:
- Marketing version `1.0.0`, build number `1` (increment build number on every
  upload; keep a note in CONFIG.md).
- Signing: Xcode → "Automatically manage signing", Team = `<APPLE-TEAM-ID>`
  (user must be logged into Xcode with their Apple ID first — human step).
- Confirm bundle ID matches the App ID registered in Phase 1.
- Set `ITSAppUsesNonExemptEncryption` = `NO` in Info.plist (HTTPS-only counts
  as exempt) so every upload doesn't prompt the export-compliance question.

## Step 2 — Archive and upload

Human-in-the-loop path (recommended, least fragile):
1. Model: `cd mobile && npx cap sync ios`, then open Xcode.
2. Human: select "Any iOS Device (arm64)" → Product → Archive → Organizer →
   Distribute App → App Store Connect → Upload. Xcode handles signing.
3. Wait for processing email (~15 min), then the build appears in TestFlight.

CLI alternative if the human prefers (model can run, human supplies an
App Store Connect **API key** — never a password):
```bash
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export
xcrun altool --upload-app ...   # verify current tool: notarytool/altool/Transporter
```
(Verify the current upload tooling in Apple docs at execution time; it changes.)

## Step 3 — TestFlight beta (human, with model checklist)

Internal testing (no beta review needed): add the user's own Apple ID as an
internal tester, install via the TestFlight app on a real iPhone.

Smoke-test checklist on device (human runs, reports back):
- [ ] Cold start on cellular; homepage loads < ~3s.
- [ ] Safe areas correct on a notched phone in light AND dark mode.
- [ ] External deal link opens outside the WebView.
- [ ] Save a deal → airplane mode → force-quit → reopen → saved deal readable.
- [ ] Share sheet shares a working URL.
- [ ] Quick actions (home-screen long-press) open the right screens.
- [ ] No admin access anywhere.
- [ ] Rotate, background/foreground, low-connectivity behaviour sane.

Fix everything found; repeat upload (build number +1) until clean.

## Step 4 — App Store Connect submission (human enters, model prepares)

- Attach the clean build to the 1.0.0 version in Connect.
- Enter listing copy, screenshots, privacy labels from Phase 5 (all
  pre-approved by the user).
- **App Review notes** (model drafts; critical for this architecture):
  - State plainly: "DealStack AU is a hybrid app. Content is served from our
    website; the app adds native features: offline saved deals, native share,
    home-screen quick actions, haptics. Navigation is restricted to our domain;
    external links open in Safari."
  - No demo account needed (no login). Say so explicitly.
  - Contact phone/email for the reviewer.
- Release option: "Manually release this version" (so a rejection fix doesn't
  auto-ship a stale build).
- Submit.

## Step 5 — While in review

Typical review time: 1–3 days. If rejected → `07-REVIEW-CONTINGENCY.md`.
If approved → human presses Release. Afterwards: tag the repo
(`git tag ios-v1.0.0 && git push --tags`) and record the release date in
CONFIG.md.

## Done when
- [ ] Build on TestFlight, device smoke-test checklist fully green.
- [ ] Listing + privacy labels entered as approved.
- [ ] Submitted with review notes.
- [ ] Outcome recorded; repo tagged on release.
