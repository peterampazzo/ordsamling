# Ordsamling

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
