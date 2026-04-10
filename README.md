# 🇩🇰 Ordsamling

I tend to remember things best by writing them down. While paper helps me memorize, it’s hard to carry everywhere, and I needed a "pocket notebook" that could also help me actively exercise my memory.

Existing apps like Duolingo often don't match the specific level or vocabulary I encounter at school or in daily life. That’s why I built **Ordsamling** — a minimalist language notebook designed to rescue my Danish, English, and (since I'm Italian) Italian vocabulary from being forgotten.

With the help of some AI agents to polish the engineering, I built this as a Vite JS web app hosted on Cloudflare Pages. It uses Workers KV for persistent storage and Cloudflare Workers AI to keep the practice quizzes challenging and relevant.

**🚀 Check out the live demo: https://ordsamling.pages.dev/?demo**

### What Ordsamling Does 🧠

* **Personal Trilingual Notebook**: A mobile-friendly space to capture Danish, English, and Italian vocabulary from school or daily life.

* **Deep Danish Grammar**: Go beyond translation with dedicated tracking for noun genders (en/et), verb tenses, and adjective inflections.

* **Smart AI Quizzes**: Exercise your memory with practice modes featuring AI-generated "smart distractors" and timers to build real-world conversation speed.

* **Progress Insights**: Automatically track your history to identify "Weakest Words," ensuring you focus your study time where it’s needed most.

## Run it locally

```bash
# Install dependencies
pnpm install
# Run the frontend only
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
