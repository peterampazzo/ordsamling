Swap the canonical and Open Graph URLs in `index.html` so Chrome's share button (and any social card) uses `https://ordsamling.pages.dev/` instead of `https://ordsamling.app/`.

## Changes

`index.html`:
- `<link rel="canonical" href="https://ordsamling.pages.dev/" />`
- `<meta property="og:url" content="https://ordsamling.pages.dev/" />`

That's it — the `og:image` path stays relative (`/og-image.jpg`) so it resolves correctly on whichever host serves the page. Chrome's share button reads the canonical link (or falls back to the address bar), so this is enough to flip the shared URL.

## Note

If `ordsamling.app` is still attached as the **Primary** custom domain in Project Settings → Domains, users who land on `ordsamling.app` will still see that URL in their address bar. To make `ordsamling.pages.dev` the only shared URL, also set `ordsamling.app` to non-primary or remove it from the project — but that's a settings change, not code, and I'll leave it alone unless you say so.
