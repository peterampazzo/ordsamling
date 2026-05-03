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
 * Returns the raw Google token response JSON.
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
  // Validate required env vars are configured
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response(
      JSON.stringify({ error: 'OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  });

  if (body.grant_type === 'authorization_code') {
    params.set('grant_type', 'authorization_code');
    params.set('code', body.code);
    params.set('code_verifier', body.code_verifier);
    params.set('redirect_uri', body.redirect_uri);
  } else if (body.grant_type === 'refresh_token') {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', body.refresh_token);
  } else {
    return new Response(
      JSON.stringify({ error: 'Unsupported grant_type.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const googleResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const responseBody = await googleResponse.text();

  return new Response(responseBody, {
    status: googleResponse.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
