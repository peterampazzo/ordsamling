
# iOS Web Push Notifications (VAPID, zero-cost)

A serverless web-push pipeline that re-engages iPhone users who installed the PWA. Uses the open Web Push standard (VAPID) — no Apple Developer account, no APNs certificates. Works on iOS 16.4+ when the app is installed via "Add to Home Screen".

## What the user will get
- An iPhone-aware banner in Settings that tells them to "Add to Home Screen" (iOS only enables push from an installed PWA).
- A toggle inside the installed PWA to enable/disable daily reminders.
- A daily background job that pushes a "Keep your streak alive — practice today" notification only to users whose last quiz session is more than ~20 hours old.
- Tapping the notification opens the app at `/`.

## Architecture overview

```text
 iPhone PWA (installed)
   └─ usePushNotifications()  ── subscribe ──▶  POST /api/notifications/register
            │                                          │
            ▼                                          ▼
       /sw.js (push, notificationclick)        Cloudflare KV (PUSH_SUBS)
                                                       ▲
                                                       │ read
 Cloudflare Cron Worker (separate, cron: daily) ───────┘
   └─ web-push (VAPID) ──▶ Apple push relay ──▶ iPhone lock screen
```

Why a *separate* Worker for the scheduler: Cloudflare **Pages Functions** don't support cron triggers. The scheduler must be a standalone Worker with a `[triggers] crons` entry. The Pages app and the cron Worker share the same KV namespace.

## Component plan

### 1. PWA shell
- `public/manifest.json` *(new — does not exist today; only icons live under `public/`)*: `name`, `short_name`, `start_url:"/"`, `display:"standalone"`, theme/background colors, icon entries pointing to existing `apple-touch-icon.png` + `favicon-32.png`.
- `index.html`: add `<link rel="manifest" href="/manifest.json">` and `<meta name="theme-color">` if missing.
- `public/sw.js` *(new)*: `push` listener parses JSON payload `{title, body, url}` and calls `self.registration.showNotification`; `notificationclick` focuses an existing client or opens `url ?? "/"`. Registered from `src/main.tsx` only when `'serviceWorker' in navigator` and not in the Lovable preview iframe.

### 2. Client hook & UI (`src/hooks/usePushNotifications.ts`, `src/components/SettingsDialog.tsx`)
- Hook exposes `{ isSupported, isIOS, isStandalone, permission, subscription, subscribe(), unsubscribe() }`.
- `isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`.
- `isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true`.
- `subscribe()` runs only inside a click handler: registers `/sw.js`, calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) })`, then POSTs the subscription to `/api/notifications/register` with the Google OAuth access token (Bearer) so the endpoint can identify the user by email.
- `urlBase64ToUint8Array` helper lives in the hook file.
- In `SettingsDialog`:
  - If `isIOS && !isStandalone`: render an `Alert` with the i18n-keyed "Add to Home Screen" instructions (new keys `settings.push.iosInstallTitle/Body`).
  - If `isStandalone && isSupported`: render a `Switch` bound to `permission === 'granted' && subscription !== null`. Toggling on calls `subscribe()`; off calls `unsubscribe()` and `DELETE /api/notifications/register`.
  - If user is not signed in with Google, show a hint that reminders require sign-in (cron needs a stable identity).

### 3. Register endpoint (`functions/api/notifications/register.ts`)
- `onRequestPost`: validates `Authorization: Bearer <google-access-token>` by calling Google's `tokeninfo` endpoint to get the email; parses body `{endpoint, keys:{p256dh, auth}}`; stores in KV under key `sub:<email>:<sha256(endpoint)>` with value `{endpoint, p256dh, auth, email, createdAt, lastSentAt:null}`. Returns 204.
- `onRequestDelete`: same auth; removes the KV entry for the supplied endpoint.
- Binding: `env.PUSH_SUBS` (KV).

### 4. Cron Worker (new top-level folder `workers/push-cron/`)
- `wrangler.toml` with `name = "ordsamling-push-cron"`, `main = "src/index.ts"`, `[triggers] crons = ["0 17 * * *"]` (17:00 UTC ≈ evening in EU), and a KV binding to the **same** `PUSH_SUBS` namespace as Pages.
- `src/index.ts` exports `scheduled(event, env)`:
  1. `list()` all `sub:*` keys (paginated).
  2. For each subscription, optionally check a `lastQuizAt:<email>` KV key (written client-side from the Index page right after each finished session) — skip if < 20h ago.
  3. Use `web-push` (npm) with `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT="mailto:..."` to send `{title:"Daily review", body:"Keep your Danish streak alive", url:"/"}`.
  4. On `410`/`404` response, delete the KV entry. On other errors, log & continue.
- The "last quiz at" write is added to `src/pages/Index.tsx`'s existing `pushQuizSession` flow: when cloud sync is on, also `fetch('/api/notifications/heartbeat', {method:'POST', headers:{Authorization}})` to update `lastQuizAt:<email>` in KV. (Tiny new endpoint `functions/api/notifications/heartbeat.ts`.)

### 5. Terraform (`infra/`)
- `variables.tf`: add `vapid_public_key` (string) and `vapid_private_key` (string, `sensitive = true`) and `vapid_subject` (string).
- `main.tf`: 
  - Add a `cloudflare_workers_kv_namespace` resource `push_subs`.
  - Bind that namespace to the Pages project for both production & preview via `kv_namespaces = { PUSH_SUBS = cloudflare_workers_kv_namespace.push_subs.id }` inside `deployment_configs.*`.
  - Add `VITE_VAPID_PUBLIC_KEY` to `env_vars` (plain) and `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` to `secrets`.
  - Add a `cloudflare_worker_script` + `cloudflare_worker_cron_trigger` for the cron Worker (or document deploying it via wrangler with the KV binding referenced by id from TF output).
- Build secret reminder: `VITE_VAPID_PUBLIC_KEY` must also be exposed at build time in `.github/workflows/deploy-on-tag.yml` (already passes `VITE_GOOGLE_CLIENT_ID`; add the VAPID one alongside).

### 6. i18n
- Add `settings.push.*` keys in `src/i18n/en.yaml` and `src/i18n/da.yaml` (title, enable/disable, iOS install prompt, success/error toasts, signed-out hint).

### 7. Tests (`src/test/pushNotifications.test.ts`)
- Mock `navigator.serviceWorker = undefined` → `isSupported` is `false`.
- Mock UA string to iPhone + `matchMedia('(display-mode: standalone)') → {matches:false}` → hook reports `isIOS && !isStandalone` and SettingsDialog renders the install banner (component test).
- Mock standalone + permission granted → toggling the switch calls a stubbed `pushManager.subscribe` and POSTs to `/api/notifications/register`.
- Unit-test `urlBase64ToUint8Array` against a known VAPID public key fixture.

## Out of scope
- Per-user notification scheduling/quiet hours UI.
- Android/desktop-specific copy (works automatically; copy stays generic).
- Migrating `quizHistory` off localStorage — we only mirror a single `lastQuizAt` timestamp to KV for the cron filter.
- Rich notification actions/images.

## Open follow-ups (post-implementation)
- Generate the VAPID keypair once (e.g. `npx web-push generate-vapid-keys`) and store the private key as a Cloudflare secret + the public key as a build env var. The plan assumes you'll run that step manually before first deploy.
