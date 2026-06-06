/**
 * POST   /api/notifications/register   — store a Web Push subscription for the signed-in Google user
 * DELETE /api/notifications/register   — remove a subscription by endpoint
 *
 * Authentication: `Authorization: Bearer <google-access-token>`. The access
 * token is the same one the app already uses for Google Sheets sync. We
 * validate it by calling Google's userinfo endpoint and key subscriptions
 * by the resulting email.
 */

interface Env {
  PUSH_SUBS: KVNamespace;
}

interface SubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  email: string;
  createdAt: number;
  lastSentAt: number | null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getEmailFromToken(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

function getBearer(request: Request): string | null {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PUSH_SUBS) {
    return jsonResponse({ error: 'Push storage not configured.' }, 500);
  }

  const token = getBearer(request);
  if (!token) return jsonResponse({ error: 'Missing bearer token.' }, 401);

  const email = await getEmailFromToken(token);
  if (!email) return jsonResponse({ error: 'Invalid token.' }, 401);

  let body: SubscriptionBody;
  try {
    body = (await request.json()) as SubscriptionBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return jsonResponse({ error: 'Missing subscription fields.' }, 400);
  }

  const idHash = await sha256Hex(body.endpoint);
  const key = `sub:${email}:${idHash}`;
  const value: StoredSubscription = {
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    email,
    createdAt: Date.now(),
    lastSentAt: null,
  };

  await env.PUSH_SUBS.put(key, JSON.stringify(value));
  return new Response(null, { status: 204 });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PUSH_SUBS) {
    return jsonResponse({ error: 'Push storage not configured.' }, 500);
  }

  const token = getBearer(request);
  if (!token) return jsonResponse({ error: 'Missing bearer token.' }, 401);

  const email = await getEmailFromToken(token);
  if (!email) return jsonResponse({ error: 'Invalid token.' }, 401);

  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body.endpoint) return jsonResponse({ error: 'Missing endpoint.' }, 400);

  const idHash = await sha256Hex(body.endpoint);
  await env.PUSH_SUBS.delete(`sub:${email}:${idHash}`);
  return new Response(null, { status: 204 });
};
