# Hidayah FM — static conversion validation

Date: 29 October 2026. Updated directly in the existing project folder. No project copy, source ZIP, hosting deployment or live Firebase mutation was performed for the conversion.

## Current static app

The deployed website consists only of `public/`. It has no Node/Express application backend, SQLite runtime, production npm dependencies or build step. The optional Node preview serves files only; all account/library operations go directly to Firebase. The visual screens and feature flows remain in place.

- 13 static catalogue, HTTP hosting and migration-reference tests pass. All 114 Quran chapters contain 6,236 aligned Arabic Uthmani/English translation pairs. Both devotional collections contain 60 entries. Existing catalogue IDs and custom media references are preserved.
- 6 Firebase Realtime Database rules tests pass, covering cross-account and anonymous denial, legacy data compatibility, malformed direct writes, session cutoff protection and normal clearing/deletion.
- 52 browser tests pass on desktop Chromium and Pixel 7 emulation. The suite asserts zero requests to application `/api` endpoints.
- Browser coverage includes signup/login/refresh/sign-out/deletion, profile/preferences/export, Quran filters/search/reader/bookmarks/translation, audio across navigation, queue/repeat/shuffle, responsive and accessibility checks, all 120 devotional entries, likes/playlists/history/progress, custom password resets and trusted email-action links.
- Service tests cover existing Firebase account/library reuse, simultaneous writes from two contexts with forced ETag conflicts, single-use/wrong-action reset codes, old-token denial by database rules, and truthful recovery when password reset succeeds but its follow-up security sync is interrupted.
- A real browser request directly to AlAdhan returned prayer times with the expected location timezone. Static hosting CSP/CORS allow that path.
- All JavaScript syntax checks pass. Test servers and Firebase emulators were stopped after validation. Evidence and logs are under `work/`.

The catalogue and Quran text are public static files. The sign-in gate remains in the UI; Firebase rules independently protect private user records. Passwords remain in Firebase Authentication, never catalogue files or account exports. The old server source and database remain available only for developer migration/maintenance.

## Before public use

Publish the updated `database.rules.json`, enable Email/Password authentication if needed, and authorize the eventual website hostname. Deploy only `public/` using the supplied Firebase Hosting or Netlify configuration (or another static host serving it at the domain root). Set Firebase's custom email action URL to the hosted `/reset-password.html` so new real reset emails open the custom page. Existing Firebase accounts remain in the same project.

No public deployment, live rules update, live account mutation or real reset email was performed during this conversion. Physical phones, Safari, high-load behavior and every third-party recording's full playback were not certified; mobile coverage is Chromium emulation. Hosting quotas and third-party media availability still depend on the selected providers.

## Earlier validation history

The following record belongs to the previous Node-backed implementation and is retained as history. Its API counts and hosting requirements do not describe the current static website.

# Hidayah FM 3.0 — validation

Date: 29 October 2026. The catalogue expansion and custom password reset update were made directly in `C:/Users/Adeeba/OneDrive/Desktop/hidayah-fm-v3.0.0/hidayah-fm`. No project copy or new ZIP was created for this update.

## Catalogue and password reset update

- Exactly 60 Nasheeds and 60 Naats are installed in the existing catalogue database (120 total); SQLite integrity check passes.
- Every one of the 108 new recordings has verified YouTube oEmbed source title/artist metadata. Two old search links were upgraded. Overall 118 direct source recordings and 2 preserved legacy search fallbacks remain. See `server/CATALOGUE-SOURCES.md`.
- Catalogue tests cover fresh seeding, repeated seeding, upgrades with existing IDs, custom audio/link/artwork/metadata/play counts, and full API listing/filtering.
- 25/25 API, catalogue and security tests passed against isolated Firebase emulators. Reset coverage includes single-use codes, new-password sign-in, old ID-token rejection, input validation, wrong-action rejection, rate limiting and provider error handling.
- 32/32 browser scenarios passed on desktop Chromium and Pixel 7 emulation, including the existing player/library/reader flows, both 60-entry collections, custom reset confirmation/show-hide/success/login, unavailable links, failed-save retry and trusted non-reset Firebase fallback.
- Reset-page WCAG A/AA automated checks and 320px overflow checks passed. Desktop and mobile screenshots were visually inspected. Evidence is in this project's `work/password-reset-evidence` and `work/firebase-playwright-evidence`.
- JavaScript syntax checks passed for 46 files; dependency installation reported zero known vulnerabilities.
- An old-session boundary defect found during testing was corrected: resetting immediately after sign-in now advances beyond Firebase's one-second timestamp boundary before completing the change.
- The app was restarted locally and serves the custom reset page with no-store/no-referrer headers. Content APIs still reject signed-out access.

Live setup remains pending: the owner confirmed this app has not been hosted. The updated Node app must be hosted and Firebase Authentication's custom action URL set to that site's `/reset-password.html` before new real emails open the custom page. No hosting deployment, Firebase email-template change or live reset email was performed. The local page is available now. Instructions are in README. Live email delivery and production refresh-token revocation were not tested; the Auth emulator does not model password-reset refresh-token revocation, so provider rejection handling is tested separately.

The following sections record the prior 3.0 release validation, preserved as history; prior live/package checks were not repeated for this update.

## Earlier 3.0 release results

- 15/15 API, Firebase security, recovery and migration tests passed against the Auth and Realtime Database emulators.
- 22/22 browser tests passed: eleven scenarios on desktop Chromium and eleven on Pixel 7-sized Chromium.
- Automated WCAG A/AA checks passed on the tested login, Home, Quran and About screens. The additional low-contrast hovered row found during regression was corrected.
- The actual hidayah-fm Firebase project passed signup, anonymous/cross-account denial, profile/preferences/bookmark/library persistence, exports, session refresh, password changes, old-session rejection and account deletion checks.
- Temporary live Firebase test accounts were removed after testing. No recovery emails were sent to real accounts during automated tests; recovery was exercised in the emulator.
- npm audit reports zero known vulnerabilities, including development dependencies, after compatible transitive dependency overrides.
- The provided Realtime Database rules were validated in the emulator and published by the project owner. Anonymous reads from the live /users path return Permission denied.

- The release ZIP passed CRC, manifest/hash and private-file checks. A fresh extraction installed with npm ci --omit=dev, loaded its native SQLite dependency, served the login shell and returned 401 for signed-out catalogue access. Its SQLite database contains only catalogue/cache tables.

## Original QA findings

| Finding | Correction and verification |
|---|---|
| HFQA-01 Private data in ZIP | New source package uses an explicit allowlist. It excludes databases, .env, session secrets, dependencies and local media. Firebase replaces the old local signing-key authentication. |
| HFQA-02 Late library response changes queue | Route-version checks precede library state updates. A delayed Liked response no longer replaces the 114-item Quran queue. |
| HFQA-03 Missing mobile playback controls | Now playing provides previous, next, shuffle and repeat on mobile. |
| HFQA-04 Broken skip link | The link focuses main without changing the route. |
| HFQA-05 Stale Now playing metadata | Open dialog text, Arabic title, reciter and Read link update with the current item. Automatic advance was tested. |
| HFQA-06 Translation resets | Reader changes are saved to Firebase preferences and survive reload. |
| HFQA-07 Clipping at 320px | Row actions wrap onto their own row on narrow screens. Button geometry and overflow checks pass. |
| HFQA-08 Text contrast | Footer, table labels and the hovered-row numbering meet tested AA contrast checks. |
| HFQA-09 Incomplete export | Export includes settings, bookmark and playback, together with profile/library/history/progress. |

## Requested changes

- Login/signup is the entry point. Guest exploration is removed; app chrome stays hidden before sign-in and direct catalogue/private API access returns 401.
- Firebase Authentication manages passwords. User records are stored under /users/FirebaseUID in the supplied Realtime Database.
- Bookmarks and playback sync to the account; local storage is a browser cache rather than the only persistence layer.
- About includes the exact credit: Created by Zuhair Mumtaz.
- Firebase password recovery is available from login.
- Optional migration authenticates both the old local account and its new Firebase account, imports supported library data once, and leaves the legacy database byte-for-byte unchanged in the test fixture.

## Remaining boundaries

No software test guarantees every possible state is defect-free. Physical iOS/Android devices, Safari, public HTTPS hosting and high-load soak behavior were not certified in this update. Mobile testing used emulation. Sleep/background suspension and complete playback of every long recording were not repeated in this regression.

The earlier QA pass verified all 684 Quran audio URLs and all 114 reader chapters; this update sampled real audio and reader flows while exercising the authentication/UI changes. Third-party YouTube playback and regional availability remain outside the app's control. The earlier release had four devotional search fallbacks; the current update retains two. Reader/audio verse synchronization, offline downloads and social login are not implemented.

Legacy private accounts were not automatically uploaded. Users can sign up in Firebase and run the documented migration command with both passwords. The original ZIP still exists as a private backup; distribute the new clean ZIP.
