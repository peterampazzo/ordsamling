/**
 * POST /api/oauth/token
 *
 * Server-side OAuth2 token exchange and refresh endpoint.
 * Keeps the client secret out of the browser bundle.
 *
 * Accepts JSON body with either:
 *   { grant_type: 'authorization_code', code: string, code_verifier: string, redirect_uri: string }
 *   { grant_type: 'refresh_token', refresh_token: string }
 *
 * Returns the validated Google token response without caching credentials.
 */

interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

interface AuthCodeBody {
  grant_type: 'authorization_code';
  code: string;
  code_verifier: string;
  redirect_uri: string;
}

interface RefreshBody {
  grant_type: 'refresh_token';
  refresh_token: string;
}

type RequestBody = AuthCodeBody | RefreshBody;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
  const origin = new URL(request.url).origin;
  const site = request.headers.get('Sec-Fetch-Site');
  if (request.headers.get('Origin') !== origin || (site && site !== 'same-origin' && site !== 'none')) {
    return json({ error: 'Cross-origin token requests are not allowed.' }, 403);
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    return json({ error: 'Expected application/json.' }, 415);
  }
  // Validate required env vars are configured
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json({ error: 'OAuth is not configured.' }, 500);
  }

  let body: Partial<RequestBody> | null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Missing JSON body.' }, 400);
    let bytes = 0;
    let text = '';
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) {
        await reader.cancel();
        return json({ error: 'Request body too large.' }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    body = JSON.parse(text + decoder.decode()) as Partial<RequestBody> | null;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400);
  const validString = (value: unknown, max = 8192): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= max;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  });

  if (body.grant_type === 'authorization_code') {
    const redirectUri = `${origin}/oauth/callback`;
    if (!validString(body.code) || !validString(body.code_verifier, 128) ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier) ||
      (body.redirect_uri !== undefined && body.redirect_uri !== redirectUri)) {
      return json({ error: 'Invalid authorization code request.' }, 400);
    }
    params.set('grant_type', 'authorization_code');
    params.set('code', body.code);
    params.set('code_verifier', body.code_verifier);
    params.set('redirect_uri', redirectUri);
  } else if (body.grant_type === 'refresh_token') {
    if (!validString(body.refresh_token)) return json({ error: 'Invalid refresh request.' }, 400);
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', body.refresh_token);
  } else {
    return json({ error: 'Unsupported grant_type.' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const googleResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params, signal: controller.signal,
    });
    const responseBody = await googleResponse.json() as {
      access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; error?: string;
    };
    if (!googleResponse.ok) {
      return json({ error: responseBody.error === 'invalid_grant' ? 'invalid_grant' : 'Token request failed.' },
        googleResponse.status >= 500 ? 502 : googleResponse.status);
    }
    if (!validString(responseBody.access_token) || typeof responseBody.expires_in !== 'number' ||
      !Number.isFinite(responseBody.expires_in) || responseBody.expires_in <= 0) {
      return json({ error: 'Invalid token response.' }, 502);
    }
    return json({
      access_token: responseBody.access_token, expires_in: responseBody.expires_in,
      ...(validString(responseBody.refresh_token) ? { refresh_token: responseBody.refresh_token } : {}),
      token_type: responseBody.token_type,
    });
  } catch {
    return json({ error: 'Google token service is temporarily unavailable.' }, 502);
  } finally {
    clearTimeout(timeout);
  }
};
