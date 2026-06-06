/**
 * Daily reminder cron Worker.
 *
 * Reads all `sub:<email>:<hash>` entries from the shared PUSH_SUBS KV
 * namespace, skips users whose `lastQuizAt:<email>` is within the last
 * 20 hours, and sends a Web Push nudge using VAPID.
 *
 * On 404/410 from the push service the subscription is purged. Other
 * failures are logged and the iteration continues.
 */

import webpush from 'web-push';

interface Env {
  PUSH_SUBS: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  email: string;
  createdAt: number;
  lastSentAt: number | null;
}

const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;

const PAYLOAD = {
  title: 'Keep your Danish streak alive',
  body: 'A few minutes of practice today goes a long way.',
  url: '/',
  tag: 'ordsamling-daily',
};

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },

  // Allow manual triggering via `wrangler tail` / curl while developing.
  async fetch(_req: Request, env: Env): Promise<Response> {
    await run(env);
    return new Response('ok');
  },
};

async function run(env: Env): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    console.error('VAPID configuration missing');
    return;
  }

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const now = Date.now();
  let cursor: string | undefined;

  do {
    const page = await env.PUSH_SUBS.list({ prefix: 'sub:', cursor });
    cursor = page.list_complete ? undefined : page.cursor;

    for (const { name } of page.keys) {
      const raw = await env.PUSH_SUBS.get(name);
      if (!raw) continue;

      let sub: StoredSubscription;
      try {
        sub = JSON.parse(raw) as StoredSubscription;
      } catch {
        continue;
      }

      // Skip if the user practiced recently.
      const lastQuizRaw = await env.PUSH_SUBS.get(`lastQuizAt:${sub.email}`);
      const lastQuizAt = lastQuizRaw ? Number(lastQuizRaw) : 0;
      if (lastQuizAt && now - lastQuizAt < TWENTY_HOURS_MS) continue;

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(PAYLOAD),
        );
        sub.lastSentAt = now;
        await env.PUSH_SUBS.put(name, JSON.stringify(sub));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await env.PUSH_SUBS.delete(name);
        } else {
          console.warn('push failed', { name, status, err: String(err) });
        }
      }
    }
  } while (cursor);
}
