# Hidayah FM 3.0 — static web app

Created by Zuhair Mumtaz

Hidayah FM runs entirely in the browser. Deploy the contents of **`public/`** to an HTTPS static host: there is no application server, SQLite runtime, build step or production npm dependency. Firebase Authentication and Realtime Database provide accounts and private libraries. The current project and account/library IDs are retained.

## Open locally

Double-click **Start-Hidayah.cmd**. It needs only Node.js 22.13+ (Node.js 24 LTS recommended), starts a small static file preview, and opens the browser. It does not install packages. Keep its window open while using the local preview. The launcher tries ports 3000–3010.

From a terminal:

```powershell
npm start
# Or start the preview and open a browser:
npm run launch
```

`npm start` uses a fixed port of 3000. To choose another port in PowerShell, set `$env:PORT='3001'` before starting. `HOST` defaults to `127.0.0.1`. The preview reads environment variables directly; it does not read `.env`. Opening `index.html` with a `file://` address is unsupported because browsers require HTTP for module and JSON loading. A deployed site needs no Node process.

## Deploy the static site

Serve **only `public/` at the domain root**, with `index.html` as the entry page. The app uses hash routes such as `/#/quran`, so no catch-all or `/api` rewrite is needed. Existing `home.html`, `quran.html`, `library.html`, `now-playing.html`, `account.html`, `login.html` and `signup.html` bookmarks redirect to the corresponding app screen.

Firebase Hosting configuration is included in `firebase.json`; it uses `public/`, HTTPS service headers and no Cloud Functions. The included `netlify.toml` also publishes `public/` with no build command, and `public/_headers` supplies compatible headers for Netlify/Cloudflare Pages. For another provider, apply the same security headers there. If custom recordings were imported, include their files from `public/media/` in the upload; that folder is ignored by Git to avoid accidentally publishing personal recordings.

Do not upload the repository root, `data/`, `.env`, `work/`, account exports, or legacy databases. GitHub Pages user/organization sites or a custom domain can serve this app at `/`; a project site hosted under `/repository-name/` requires a base-path adaptation because asset URLs currently start at `/`.

This conversion has not deployed a site or changed live Firebase configuration. After selecting the website hostname, complete the Firebase settings below before inviting users.

## Firebase setup and private data

The public web configuration is in `public/js/firebase-config.js` and points to project **hidayah-fm**, with Realtime Database **https://hidayah-fm-default-rtdb.firebaseio.com**. The API key identifies this web app; it is not an administrator credential. No service-account key or analytics initialization is included.

1. Enable **Email/Password** in Firebase Authentication.
2. Add the actual website hostname in **Authentication → Settings → Authorized domains**. Add `localhost` for local use when needed.
3. Publish this project's updated **`database.rules.json`** to the Realtime Database before using the static app. The rules enforce account ownership and validate stored data directly in Firebase. Keep the default denial of anonymous and cross-account access.
4. Configure the custom password-reset email action URL described below.

The sign-in/signup gate stays in the app. The catalogue and bundled Quran text are public static assets. Personal data is protected by Firebase rules, independently of the browser UI. The browser talks directly to Firebase's HTTPS Authentication and Realtime Database REST APIs; it does not call an application `/api` server.

Firebase stores profile, preferences, playlists, likes, history, playback position/queue and reading bookmark under `/users/<firebase-uid>`. Conditional database writes preserve concurrent updates. Authentication manages passwords; they are never stored in Realtime Database or JSON exports. The browser keeps the signed-in session and local preferences, and restores saved playback paused after reload. Account export and account deletion remain available in Settings.

## Custom password reset

The matching Hidayah FM page is **`/reset-password.html`**. It requests a reset email, verifies a single-use link, accepts and confirms the new password, and returns to sign-in. Expired, used and invalid links offer a new reset request.

To make newly sent Firebase emails open this page:

1. Upload `public/` and confirm `https://YOUR-APP-DOMAIN/reset-password.html` opens.
2. In [Firebase Authentication → Templates](https://console.firebase.google.com/project/hidayah-fm/authentication/emails), edit **Password reset**, choose **Customize action URL**, and enter that full HTTPS address.
3. Keep Firebase's generated reset-link placeholder, save the template, and request a new email. Previously sent emails keep their old destination.

The action URL is a Firebase Console setting; adding this page cannot change already-configured email destinations by itself. A `continueUrl` alone does not replace Firebase's handler. Link-supplied API keys and arbitrary redirect destinations are ignored by the custom page.

Firebase can apply the shared action URL to other email actions. The page preserves email verification and email recovery through a clearly labelled link to the fixed Hidayah FM Firebase handler. Password reset stays within Hidayah FM.

A localhost reset link works only on the computer running the same preview port. Use a deployed HTTPS URL for normal account recovery. Reference: [Firebase custom email action handlers](https://firebase.google.com/docs/auth/custom-email-handler).

## Features retained

- All 114 surahs, Arabic names, meanings, verse counts, filters, grid/list views and search.
- Six full-surah Quran reciters plus an external reciter source.
- All **6,236 Arabic Uthmani/Sahih International English verse pairs** bundled locally across 114 chapter files, with copy, verse jump and cloud bookmark.
- Audio across navigation, queue and ordering, previous/next, seek, shuffle, repeat, speed, volume and sleep timer; mobile Now playing controls.
- Profile and preferences, password change, account export/deletion, and custom password reset.
- Likes, playlists, history, completion counts, saved playback and Friday/daily recommendations.
- Prayer times for the selected city/country and calculation method, fetched directly from AlAdhan.
- Responsive layout, keyboard skip link and accessible form/control labels.
- About credit: **Created by Zuhair Mumtaz**.

The devotional catalogue contains **60 Nasheeds and 60 Naats**: 118 direct YouTube sources and two labelled legacy search fallbacks. All 108 additions had matching source title/artist metadata verified. Source provenance remains in `server/CATALOGUE-SOURCES.md` and `server/catalogue.json`. YouTube sources use the existing source player and do not enter the direct-audio queue unless a permitted recording is attached. Availability, regional restrictions and source permissions remain with the provider. Published arrangements vary; only recordings explicitly labelled Vocals Only/Acapella are presented that way.

The retained fallback title/artist pairings are **Taweel Al Shawq — Abu Ali** and **Madine Ka Safar — Junaid Jamshed**; exact recordings could not be verified, so no different performance was substituted. The Juz filter identifies where a surah starts. Reader scrolling is independent of full-surah audio; completion means playback reached the end.

Internet is needed for sign-in, cloud synchronization, remote audio, YouTube and current prayer schedules. Quran text and catalogue requests go to the static host only. This is not an offline-installable PWA.

## Catalogue, recordings and backups

The active catalogue is **`public/data/catalogue.json`**. It preserves the current SQLite catalogue's track/reciter IDs and custom media metadata. `public/data/quran/` contains all chapter text plus a source/checksum manifest. Static runtime never opens SQLite.

Maintenance commands need Node only, except the explicit legacy SQLite import:

```powershell
npm run data:check
npm run backup
npm run media -- --id 1 --file "C:/Music/permitted-recording.mp3"
npm run media -- --id 1 --audio-url "https://your-host.example/recording.mp3"
npm run media -- --title "Title" --artist "Artist" --type naat --link-url "https://www.youtube.com/watch?v=VIDEO_ID"
```

Media changes update the static catalogue directly, retaining IDs and unrelated metadata. Local audio imports copy the recording into `public/media/` without modifying the original. Redeploy the updated static files afterward. The backup command saves catalogue JSON in `work/backups/`; retain any imported `public/media/` files with that backup. Use **Account → Export your data** for the Firebase library and keep those exports private.

`npm run data:refresh-quran` downloads Arabic Uthmani and Sahih International from AlQuran Cloud and validates all chapter counts, local/global verse indices and 6,236 aligned verse pairs before writing files. `npm run data:check` verifies the existing files without network access.

For an intentional import from the retained legacy public catalogue, install development dependencies and run `npm run data:import`. It reads `data/hidayah-catalogue.db` (or `DATA_DIR`) without modifying it and replaces the active public JSON using an explicit public-column allowlist. Do not run that import after editing the static catalogue unless you intend to restore the older SQLite content. The legacy `npm run seed` command still maintains the old SQLite catalogue; it does not change the deployed static JSON.

## Existing local accounts and libraries

Existing Firebase accounts continue to use the same project and user IDs. Old local SQLite accounts are not automatically Firebase accounts and are not uploaded with static assets.

To import an old local library, install development dependencies with `npm ci`, create a Firebase account with the same email, keep the original `hidayah.db` private, then run:

```powershell
npm run migrate -- "C:/private/path/hidayah.db" you@example.com
```

The interactive tool asks for both old local and new Firebase passwords with input hidden. It reads the old database without changing it, preserves existing cloud data and prevents duplicate imports. It validates references against the active public catalogue (`public/data/catalogue.json`), including custom recordings added through the media tool, and reports entries absent from that catalogue instead of inventing IDs. It does not open or seed the retained SQLite catalogue. Keep WAL/SHM files with an active SQLite database or use a consistent backup. Old device-only bookmarks cannot be recovered from that database.

`npm run reset-password -- you@example.com` remains available with development dependencies and sends a reset email only when explicitly invoked. `server/` and its development dependencies are retained for migration and legacy tests; they are not deployed or used by the website.

## Validation

The static integrity and hosting tests require only Node:

```powershell
npm test
npm run data:check
npm run check
```

For isolated Firebase rules and desktop/mobile browser tests, use Node.js 24, Java 21+ and development dependencies:

```powershell
npm ci
npx playwright install chromium
npm run test:firebase
npm run test:e2e
```

`test:firebase` runs Realtime Database rules tests in the demo Auth/Database emulators. `test:e2e` uses the same demo emulators and the static file preview. Browser tests configure emulator access with an explicit test-only setting restricted to loopback pages. Deployed Firebase configuration and hosting CSP contain no emulator endpoints. Do not run both emulator commands simultaneously on the same ports.

`test:rules` and `test:browser` are internal commands for already-running emulators. `test:legacy-api` retains the previous Node API/migration tests for maintenance and also requires emulators. It is separate from static website validation. Reports/fixtures belong in ignored `work/`.

The optional `npm run package` utility remains available for a source archive; no archive is needed for static deployment. Only `public/` is the website.

Sources: QuranicAudio/MP3Quran for Quran audio, AlQuran Cloud for bundled Quran text, AlAdhan for prayer schedules, and the credited source artists/channels for devotional recordings.
