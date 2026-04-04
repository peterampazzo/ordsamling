# Ordsamling

Ordsamling is a Vite + React app deployed to Cloudflare Pages. Entries are stored in Workers KV behind Pages Functions.

## Local development

### Quick command reference

Use Node 22 first:

```bash
nvm use
```

Install dependencies:

```bash
pnpm install
```

Frontend only (no Functions):

```bash
pnpm dev
```

Frontend + Pages Functions locally:

```bash
pnpm run build
pnpm run dev:pages
```

Generate Cloudflare worker/binding types:

```bash
pnpm run cf-typegen
```

Optional: write directly to remote preview KV from local shell:

```bash
npx wrangler kv key put entries:v1 "[]" --binding LEXICON --preview --remote
```

Install dependencies:

```bash
pnpm install
```

Run the frontend only:

```bash
pnpm dev
```

During plain Vite development, the app falls back to browser localStorage if the `/api/entries` endpoint is not available.

### Node version

This repo pins Node to `22.11.0` via `.nvmrc` and `.node-version`.

Use:

```bash
nvm use
```

If you want nvm to switch automatically when you enter the project folder, add this to your `~/.zshrc`:

```bash
autoload -U add-zsh-hook
load-nvmrc() {
	local nvmrc_path
	nvmrc_path="$(nvm_find_nvmrc)"
	if [ -n "$nvmrc_path" ]; then
		nvm use --silent
	fi
}
add-zsh-hook chpwd load-nvmrc
load-nvmrc
```

Run against Cloudflare Pages Functions locally after building once:

```bash
pnpm run build
pnpm run dev:pages
```

## Cloudflare setup

1. Create two KV namespaces, one for production and one for preview.
2. Replace the placeholder IDs in `wrangler.toml`.
3. Deploy the Pages project with Wrangler so the `functions/` directory is included.

Generate Worker types after configuring bindings:

```bash
pnpm run cf-typegen
```

Deploy manually:

```bash
pnpm run build
pnpm run deploy:pages -- --project-name <your-pages-project>
```

## Manual deployment to Cloudflare Pages

This project can be deployed manually to the Cloudflare Pages project named ordsamling.

### Prerequisites

- A Cloudflare account with Pages access
- Node.js 22 available locally (nvm is recommended)
- Build output present in dist

### 1) Use Node 22 in your shell

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
node -v
```

### 2) Create the Pages project (first time only)

```bash
npx --yes wrangler@4 pages project create ordsamling --production-branch main
```

### 3) Build and deploy

```bash
pnpm install
pnpm run build
npx --yes wrangler@4 pages deploy dist --project-name ordsamling --branch main
```

After deployment, Cloudflare prints a preview URL and the production site is available at https://ordsamling.pages.dev.

## KV troubleshooting

If you do not see data in Cloudflare KV Pairs, run these commands from the project root.

Use Node 22 first:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22
```

List keys in production KV namespace:

```bash
npx --yes wrangler@4 kv key list --binding LEXICON --remote
```

List keys in preview KV namespace:

```bash
npx --yes wrangler@4 kv key list --binding LEXICON --preview --remote
```

Write a test payload to production KV:

```bash
npx --yes wrangler@4 kv key put entries:v1 "[]" --binding LEXICON --remote
```

Write a test payload to preview KV:

```bash
npx --yes wrangler@4 kv key put entries:v1 "[]" --binding LEXICON --preview --remote
```

Read back payload from production KV:

```bash
npx --yes wrangler@4 kv key get entries:v1 --binding LEXICON --remote
```

Read back payload from preview KV:

```bash
npx --yes wrangler@4 kv key get entries:v1 --binding LEXICON --preview --remote
```

## Release tag

```bash
git tag -a v1.4.0 -m "Release v1.4.0"
git push origin v1.4.0
```