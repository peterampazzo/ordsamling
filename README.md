# Ordsamling

Ordsamling is a Vite + React app deployed to Cloudflare Pages. Entries are stored in Workers KV behind Pages Functions.

## Local development

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

## Release tag

```bash
git tag -a v1.4.0 -m "Release v1.4.0"
git push origin v1.4.0
```