# 🇩🇰 Ordsamling

I tend to remember things best by writing them down. While paper helps me memorize, it's hard to carry everywhere, and I needed a "pocket notebook" that could also help me actively exercise my memory.

Existing apps like Duolingo often don't match the specific level or vocabulary I encounter at school or in daily life. That's why I built **Ordsamling** — a minimalist language notebook designed to rescue my Danish, English, and (since I'm Italian) Italian vocabulary from being forgotten.

**🚀 Check out the live demo: https://ordsamling.pages.dev/?demo**

### What Ordsamling Does 🧠

* **Personal Bilingual Notebook**: A mobile-friendly space to capture Danish, English (and more) vocabulary from school or daily life.

* **Deep Danish Grammar**: Go beyond translation with dedicated tracking for noun genders (en/et), verb tenses, and adjective inflections.

* **Smart AI Quizzes**: Exercise your memory with practice modes featuring AI-generated "smart distractors" and timers to build real-world conversation speed.

* **Progress Insights**: Automatically track your history to identify "Weakest Words," ensuring you focus your study time where it's needed most.

* **Zero Infrastructure**: Your vocabulary lives in your own Google Spreadsheet. AI features use your own Gemini API key. The developer never sees your data.

## Architecture

Ordsamling is a **local-first** SPA hosted on Cloudflare Pages:

- **Storage**: `localStorage` is the primary read/write store (zero latency). If you connect Google Drive, your data is synced to a Google Spreadsheet you own ("Ordsamling Data") in the background.
- **AI**: Quiz distractors and bulk import call the Gemini API **directly from the browser**. You supply your own Gemini API key in Settings — it is never sent to any server.
- **Server-side**: The only Cloudflare Pages Function is `functions/api/oauth/token.ts`, which handles the Google OAuth token exchange and refresh (keeps the client secret out of the browser bundle).

## Run it locally

```bash
# Install dependencies
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
