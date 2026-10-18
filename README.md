# 🇩🇰 Ordsamling

I tend to remember things best by writing them down. While paper helps me memorize, it's hard to carry everywhere, and I needed a "pocket notebook" that could also help me actively exercise my memory.

Existing apps like Duolingo often don't match the specific level or vocabulary I encounter at school or in daily life. That's why I built **Ordsamling** — a minimalist language notebook designed to rescue my Danish, English, and (since I'm Italian) Italian vocabulary from being forgotten.

**🚀 Check out the live demo: https://ordsamling.pages.dev/demo**

### What Ordsamling Does 🧠

* **Personal Bilingual Notebook**: A mobile-friendly space to capture Danish, English (and more) vocabulary from school or daily life.

* **Deep Danish Grammar**: Go beyond translation with dedicated tracking for noun genders (en/et), verb tenses, and adjective inflections.

* **Smart AI Quizzes**: Exercise your memory with practice modes featuring AI-generated "smart distractors" and timers to build real-world conversation speed.

* **Progress Insights**: Automatically track your history to identify "Weakest Words," ensuring you focus your study time where it's needed most.

* **Your Data, Your Storage**: Vocabulary and quiz history stay on your device by default, with optional sync to your own Google Spreadsheet. AI features use your own Gemini API key.

## Architecture

Ordsamling is a **local-first** SPA hosted on Cloudflare Pages:

- **Storage**: `localStorage` is the primary read/write store (zero latency). If you connect Google Drive, your data is synced to a Google Spreadsheet you own ("Ordsamling Data") in the background.
- **AI**: Quiz distractors and bulk import call the Gemini REST API **directly from the browser**. You supply your own Gemini API key in Settings — it is sent to Google, never to a maintainer-controlled server.
- **Server-side**: The only Cloudflare Pages Function is `functions/api/oauth/token.ts`, which handles the Google OAuth token exchange and refresh (keeps the client secret out of the browser bundle).
- **Credentials**: Google access/refresh tokens and your Gemini key are stored in browser localStorage. The OAuth function transiently handles authentication credentials, but vocabulary and quiz history are not sent to it. Browser storage is not a protected credential vault; keep exports as backups and treat scripts running on the app's origin as trusted.
- **Sync reliability**: A shared engine journals pending changes before network debounce and retains the local copy on reconnect. Conflicting edits are preserved until you choose a version. Same-browser tabs coordinate with Web Locks; unsupported browsers retain local changes and report that cloud sync is unavailable. Sheets does not provide atomic cross-device compare-and-swap, so concurrent edits on separate devices still require care.

## Run it locally

```bash
# Install dependencies
nvm use
pnpm install
# Run the frontend only (no Google Drive auth)
pnpm dev
```

### Run the full app with Pages Functions

Required if you want to test the Google Drive OAuth flow locally. Build once, then start the local Pages preview:

```bash
pnpm run build
pnpm run dev:pages
```

## Node version

This project targets Node.js 22. Run `nvm use` in the repository root to switch to the correct version.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`typecheck` checks both the application and the Pages Functions/configuration project. Server endpoint tests live in `tests/`, outside the deployable `functions/` directory. With the built app served by `pnpm exec vite preview --port 4173`, run `pnpm exec playwright test --config=playwright.ci.config.ts` for browser checks.

The release tag is the displayed version authority: the release workflow writes `public/version.json` during the build. `package.json` is a private application manifest, not a separately released package.

React Router uses the patched v7 release. The compatible XML-parser security patch is pinned through the project's pnpm override and lockfile. Mammoth is used only through its browser/library API; its unused `argparse` dependency is excluded to remove the unpatched `sprintf-js` dependency. Mammoth's command-line executable is not supported by this application's install. Browser tests cover actual `.docx` text extraction as well as routing.

Run `pnpm audit --prod` for application dependency findings and `pnpm audit` for development tooling too. Development-tool advisories, including Tinypool through Vitest, still need a dedicated tooling upgrade rather than an incompatible transitive override. Do not expose development/test servers to untrusted networks.

## Retired daily reminders

Daily push reminders have been removed. `/sw.js` remains as a small retirement worker so returning browsers can unsubscribe and unregister their old installation; new installations do not register a worker. Keep this endpoint available for dormant clients returning after the release.

Before merging the infrastructure removal, check whether `ordsamling-push-cron` exists in Cloudflare and disable its scheduled/public invocation if deployed. Review the Terraform plan before removing the push KV namespace and bindings: the existing Terraform workflow applies changes automatically on `main`. Preserve the Pages project and Google OAuth secrets. After retirement is verified, remove obsolete VAPID secrets/variables from Cloudflare and GitHub. These are production operations requiring separate approval, not automatic consequences of local development.

---

## Setup Guide

### 1. Google Cloud Project & OAuth Client

The Google Drive sync feature requires a Google Cloud project with the Sheets and Drive APIs enabled, and an OAuth 2.0 client ID configured for your deployment URL.

#### Step 1 — Create a project

Go to [console.cloud.google.com](https://console.cloud.google.com), click the project dropdown at the top, and create a new project. Give it any name (e.g. `ordsamling`).

#### Step 2 — Enable APIs

In the left sidebar go to **APIs & Services → Library** and enable both:

- [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)

#### Step 3 — Configure the OAuth consent screen

Go to **APIs & Services → OAuth consent screen**.

- **User type**: External
- **App name**: Ordsamling
- **User support email / Developer contact**: your email

On the **Scopes** step, add:

| Scope | Purpose |
|---|---|
| `https://www.googleapis.com/auth/drive.file` | Access only files created by this app |
| `https://www.googleapis.com/auth/spreadsheets` | Read and write the vocabulary spreadsheet |
| `https://www.googleapis.com/auth/userinfo.email` | Display connected account |
| `https://www.googleapis.com/auth/userinfo.profile` | Display connected account name |

On the **Test users** step, add your own Google account. While the app is in **Testing** status, only listed test users can complete the OAuth flow — this is fine for personal use.

#### Step 4 — Create an OAuth 2.0 Client ID

Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.

- **Application type**: Web application
- **Authorized JavaScript origins**:
  ```
  https://your-project.pages.dev
  http://localhost:5173
  ```
- **Authorized redirect URIs**:
  ```
  https://your-project.pages.dev/oauth/callback
  http://localhost:5173/oauth/callback
  ```

Copy the **Client ID** and **Client Secret**.

#### Step 5 — Configure environment variables

For local development, create a `.env.local` file (never commit this):

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

For local Pages Functions (`pnpm run dev:pages`), create a `.dev.vars` file (never commit this):

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

For Cloudflare Pages production, set `VITE_GOOGLE_CLIENT_ID` as a plain environment variable (needed at build time) and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` as secrets:

```bash
npx wrangler@4 pages secret put GOOGLE_CLIENT_ID --project-name ordsamling
npx wrangler@4 pages secret put GOOGLE_CLIENT_SECRET --project-name ordsamling
```

The token exchange happens server-side in `functions/api/oauth/token.ts`, so the client secret never reaches the browser.

### 2. Gemini API Key (end-user setup)

Users who want AI features (smart quiz distractors, bulk import) need a free Gemini API key:

1. Go to [Google AI Studio](https://aistudio.google.com) and sign in.
2. Click **Get API key → Create API key**.
3. Paste it into **Settings → AI Engine** in the app.

The key is stored only in the user's browser (`localStorage`) and is sent **directly to the Gemini API** — it never touches any server.

---

## Deploy

```bash
pnpm run build
npx --yes wrangler@4 pages deploy dist --project-name <your-pages-project> --branch main
```

---

## Privacy

See [/privacy](https://ordsamling.pages.dev/privacy) for the full privacy policy. In short: your vocabulary stays in your browser or your own Google Spreadsheet. The developer has no access to your data.
