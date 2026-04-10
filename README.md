# Ordsamling

Ordsamling is a simple language notebook for collecting and practicing Danish, English, and Italian vocabulary. It is built with React and Vite, and when deployed on Cloudflare Pages it stores entries in Workers KV. In local development, the app can also use browser localStorage so you can continue working even if the backend is not running.

## What this project does

- Add vocabulary entries with translations, notes, and grammar details
- Practice with quizzes for translation, conjugation, noun forms, and fill-in-the-blank
- Keep quiz history locally in the browser
- Run the UI in Vite, or run the full app locally with Cloudflare Pages Functions

## Run it locally

### Install dependencies

```bash
pnpm install
```

### Run the frontend only

```bash
pnpm dev
```

This starts the app in Vite mode. If the backend API is not available, the app will fall back to browser localStorage and still work for basic entry management.

### Run the full app with Pages Functions

Build once and then start the local Pages preview:

```bash
pnpm run build
pnpm run dev:pages
```

This runs the app in the same style as a Cloudflare Pages deployment, including the Workers-backed storage layer.

## Node version

This project is designed for Node.js 22. Use `nvm use` in the repository root to switch to the correct version.

## Cloudflare setup

The app uses Cloudflare Pages and Workers KV. The frontend code lives in `src/`, and the backend request handlers are in `functions/`.

### Configure Cloudflare

1. Create your KV namespaces in Cloudflare.
2. Add the namespace IDs to `wrangler.toml`.
3. Generate binding types:

```bash
pnpm run cf-typegen
```

### Deploy

```bash
pnpm run build
npx --yes wrangler@4 pages deploy dist --project-name <your-pages-project> --branch main
```

After deployment, the site should be available on your Cloudflare Pages domain, for example `https://ordsamling.pages.dev`.

## Notes

- `functions/` contains the Cloudflare Pages Functions that handle storing entries.
- `src/` contains the React user interface and the browser fallback behavior.
- During plain Vite development, the app can still store entries locally in the browser.

## Troubleshooting

If data does not appear in KV, verify that the IDs in `wrangler.toml` are correct and inspect the KV content with Wrangler.

Example command:

```bash
npx --yes wrangler@4 kv key list --binding LEXICON --preview --remote
```

To reset preview KV content:

```bash
npx --yes wrangler@4 kv key put entries:v1 "[]" --binding LEXICON --preview --remote
```

## Deployment reminder

Build the app first, then deploy the generated `dist` output to Cloudflare Pages. This keeps the deployment process simple and predictable.
