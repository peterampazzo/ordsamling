/**
 * POST /api/notifications/heartbeat — record that the signed-in user just
 * finished a quiz session. The cron Worker reads this to skip users who
 * have already practiced today.
 *
 * Authentication: same `Authorization: Bearer <google-access-token>` as
 * /api/notifications/register.
 */

interface Env {
  PUSH_SUBS: KVNamespace;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PUSH_SUBS) {
    return jsonResponse({ error: 'Push storage not configured.' }, 500);
  }

  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return jsonResponse({ error: 'Missing bearer token.' }, 401);

  const email = await getEmailFromToken(match[1]);
  if (!email) return jsonResponse({ error: 'Invalid token.' }, 401);

  await env.PUSH_SUBS.put(`lastQuizAt:${email}`, String(Date.now()));
  return new Response(null, { status: 204 });
};
