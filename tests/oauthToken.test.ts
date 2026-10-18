import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../functions/api/oauth/token';

const origin = 'https://ordsamling.pages.dev';
const env = { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' };

async function request(body: unknown, headers: Record<string, string> = {}) {
  return onRequestPost({
    request: new Request(`${origin}/api/oauth/token`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    env,
  } as Parameters<typeof onRequestPost>[0]);
}

afterEach(() => vi.unstubAllGlobals());

describe('OAuth token endpoint', () => {
  it('rejects cross-origin requests before contacting Google', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await request({ grant_type: 'refresh_token', refresh_token: 'refresh' }, { Origin: 'https://other.example' })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { grant_type: 'refresh_token', refresh_token: 3 }])('rejects malformed requests: %j', async body => {
    expect((await request(body)).status).toBe(400);
  });

  it('rejects oversized requests and non-JSON bodies', async () => {
    expect((await request({ text: 'a'.repeat(20_000) })).status).toBe(413);
    expect((await request({}, { 'Content-Type': 'text/plain' })).status).toBe(415);
  });

  it('pins the redirect URI to the origin and never caches credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })));
    vi.stubGlobal('fetch', fetchMock);
    const response = await request({ grant_type: 'authorization_code', code: 'code', code_verifier: 'v'.repeat(64) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const params = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(params.get('redirect_uri')).toBe(`${origin}/oauth/callback`);
    expect(params.get('client_secret')).toBe(env.GOOGLE_CLIENT_SECRET);
  });

  it('rejects a caller-supplied redirect for a different origin', async () => {
    expect((await request({
      grant_type: 'authorization_code', code: 'code', code_verifier: 'v'.repeat(64),
      redirect_uri: 'https://other.example/oauth/callback',
    })).status).toBe(400);
  });

  it('returns a bounded error on upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Upstream detail that should not be exposed')));
    const response = await request({ grant_type: 'refresh_token', refresh_token: 'refresh' });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('Upstream detail');
  });
});
