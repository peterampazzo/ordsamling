# 🇩🇰 Ordsamling

I tend to remember things best by writing them down. While paper helps me memorize, it's hard to carry everywhere, and I needed a "pocket notebook" that could also help me actively exercise my memory.

Existing apps like Duolingo often don't match the specific level or vocabulary I encounter at school or in daily life. That's why I built **Ordsamling** — a minimalist language notebook designed to rescue my Danish, English, and (since I'm Italian) Italian vocabulary from being forgotten.

**🚀 Check out the live demo: https://ordsamling.peterampazzo.com/demo**

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

Before publishing the first release containing the infrastructure removal, check whether `ordsamling-push-cron` exists in Cloudflare and disable its scheduled/public invocation if deployed. Review the Terraform plan before removing push storage and bindings. Terraform applies run in the production release workflow; pushes to `main` only plan infrastructure changes. Preserve the Pages project and Google OAuth secrets. After retirement is verified, remove obsolete VAPID secrets/variables from Cloudflare and GitHub.

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

On the **Test users** step, add your own Google account. In **Testing** status, only listed test users can complete this OAuth flow, and Google expires its refresh tokens after seven days. To remove that testing-specific expiry, change **Google Auth Platform → Audience → Publishing status** to **In production**, then reconnect in Ordsamling. Publishing and Google verification are separate: public distribution with sensitive scopes may require verification.

#### Step 4 — Create an OAuth 2.0 Client ID

Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.

- **Application type**: Web application
- **Authorized JavaScript origins**:
  ```
  https://ordsamling.peterampazzo.com
  https://preview.ordsamling.pages.dev
  https://ordsamling.pages.dev
  http://localhost:8788
  ```
- **Authorized redirect URIs**:
  ```
  https://ordsamling.peterampazzo.com/oauth/callback
  https://preview.ordsamling.pages.dev/oauth/callback
  https://ordsamling.pages.dev/oauth/callback
  http://localhost:8788/oauth/callback
  ```

Copy the **Client ID** and **Client Secret**.

Use the actual port shown by `wrangler pages dev` if it differs from `8788`. Keep the same OAuth client during the domain migration to preserve the application's access to its existing spreadsheets. Register the stable preview alias, not each deployment's hash URL.

For brand verification, set the homepage to `https://ordsamling.peterampazzo.com/`, the privacy policy to `https://ordsamling.peterampazzo.com/privacy`, and add `peterampazzo.com` to authorized domains. Verify domain ownership in Google Search Console using an account associated with the Google Cloud project. Review every listed origin/domain before submitting for verification; preview and legacy origins can use a separate testing OAuth project if needed.

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

For deployed builds, GitHub Actions supplies `VITE_GOOGLE_CLIENT_ID` from the `GOOGLE_CLIENT_ID` secret. The production release's Terraform apply sets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on both Pages environments for the token endpoint. A client ID configured only in Cloudflare's build settings will not affect these direct-upload builds.

Both deployments currently use the same configured OAuth client. Do not override only the preview build's client ID: its Pages Function must have the matching client ID and secret too. Preview hosting and browser storage are separate, but signing in with the same Google account/application can still access the same spreadsheet; use a separate testing account for disposable data.

The token exchange happens server-side in `functions/api/oauth/token.ts`, so the client secret never reaches the browser.

### 2. Gemini API Key (end-user setup)

Users who want AI features (smart quiz distractors, bulk import) need a free Gemini API key:

1. Go to [Google AI Studio](https://aistudio.google.com) and sign in.
2. Click **Get API key → Create API key**.
3. Paste it into **Settings → AI Engine** in the app.

The key is stored in the user's browser (`localStorage`) and is sent **directly to the Gemini API**, never through a maintainer-controlled server.

---

## Deploy

The existing Cloudflare Pages project is used for both environments:

| Event | GitHub environment | Pages deployment branch | URL |
|---|---|---|---|
| Push to `main` | `preview` | `preview` | `https://preview.ordsamling.pages.dev` |
| Published non-prerelease release tagged `vX.Y.Z` | `production` | `main` | `https://ordsamling.peterampazzo.com` |
| Prerelease publication | — | — | No deployment |

The Pages project's `production_branch` stays `main`. This is the selector used by Wrangler, not a Git-triggered production deployment. Main pushes explicitly deploy with `--branch=preview`; only the production release workflow uses `--branch=main`. Keep the project configured for direct upload so a separate Cloudflare Git integration does not deploy main to production independently.

Preview builds publish `preview-<commit>` version metadata and an `X-Robots-Tag: noindex, nofollow` response header. Production checks out the release tag, validates/builds that checkout, applies its Terraform plan, and deploys using the tagged commit's SHA. A failed validation or Terraform apply prevents the Pages deployment. Releases are serialized; newer main pushes may cancel older preview deployments.

The **Terraform plan** workflow runs on relevant PRs, main pushes, and manual dispatch. It does not apply changes. Publishing a stable release is the production mutation point for both infrastructure and application deployment.

### GitHub configuration

Set these repository variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME` (`ordsamling`)
- `AWS_ROLE_ARN` (access to the existing Terraform S3 state)

Set these secrets:

- `CLOUDFLARE_API_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The deployment jobs use the GitHub environments `preview` and `production`, matching the deployment convention in `visit-copenhagen`. Configure any desired production approval/branch rules there. The AWS OIDC role used for releases must allow the subject `repo:peterampazzo/ordsamling:environment:production` with audience `sts.amazonaws.com`; keep the existing main/PR subjects needed by the plan workflow. A role limited to the main-branch subject will not authenticate a production-environment release job. Configure the production environment to allow the `v*` release tags.

### Custom domain and first release

1. Review the infrastructure plan. Terraform attaches `ordsamling.peterampazzo.com` to the existing Pages project using `cloudflare_pages_domain.production`.
2. In the existing Cloudflare DNS zone for `peterampazzo.com`, create or verify the `ordsamling` CNAME pointing to `ordsamling.pages.dev`. DNS records are managed outside this repository; do not replace an existing record without checking its purpose. If the Pages domain association was already created manually, import it into Terraform before applying.
3. Register the Google OAuth origins/callbacks above and verify the GitHub environment/AWS trust configuration.
4. Publish a stable `vX.Y.Z` release containing these changes. Confirm that the domain and certificate become active, then verify sign-in, token refresh, spreadsheet recovery, and imports.
5. Keep `ordsamling.pages.dev` and its OAuth callback available while users migrate. This change deliberately adds no redirect from the old domain.

Browser storage belongs to an origin: the new hostname has a separate vocabulary cache, history, settings, Gemini key, and OAuth tokens. On the old domain, finish syncing and export vocabulary before switching. On the new domain, reconnect the same Google account and re-enter the Gemini key (including the new hostname in its website restrictions, if configured). The current JSON export contains vocabulary only; local-only history/settings remain on the old origin and need a complete backup/import process before that origin is retired. Existing home-screen installations also retain their original origin.

---

## Privacy

See [/privacy](https://ordsamling.peterampazzo.com/privacy) for the full privacy policy. Your vocabulary stays in your browser or your own Google Spreadsheet. The maintainer does not collect your vocabulary or quiz history.
