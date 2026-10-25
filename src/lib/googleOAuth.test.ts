import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { handleOAuthCallback, getValidAccessToken, clearStoredTokens } from './googleOAuth';

const transactionKey = 'ordsamling-oauth-transaction';
const tokenKey = 'ordsamling-oauth-tokens';
const tokens = { accessToken: 'old', refreshToken: 'refresh', email: 'user@example.com', tokenExpiry: 1 };

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('OAuth transactions and refresh', () => {
  function transaction() {
    sessionStorage.setItem(transactionKey, JSON.stringify({ codeVerifier: 'v'.repeat(64), state: 'expected', createdAt: Date.now() }));
  }

  it.each([null, 'wrong'])('rejects a missing or mismatched state before exchanging credentials', async state => {
    transaction();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(handleOAuthCallback('code', state)).rejects.toThrow('Invalid or expired');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects old transactions', async () => {
    sessionStorage.setItem(transactionKey, JSON.stringify({ codeVerifier: 'v'.repeat(64), state: 'expected', createdAt: Date.now() - 11 * 60 * 1000 }));
    await expect(handleOAuthCallback('code', 'expected')).rejects.toThrow('Invalid or expired');
  });

  it('exchanges a valid transaction once and validates the returned account', async () => {
    transaction();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: 'user@example.com' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(handleOAuthCallback('code', 'expected')).resolves.toMatchObject({ accessToken: 'access', email: 'user@example.com' });
    expect(sessionStorage.getItem(transactionKey)).toBeNull();
    await expect(handleOAuthCallback('code', 'expected')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh between concurrent callers', async () => {
    localStorage.setItem(tokenKey, JSON.stringify(tokens));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'new', expires_in: 3600 })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await Promise.all([getValidAccessToken(), getValidAccessToken()])).toEqual(['new', 'new']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect credentials if the user disconnected during a refresh', async () => {
    localStorage.setItem(tokenKey, JSON.stringify(tokens));
    let complete!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(resolve => { complete = resolve; })));
    const refreshing = getValidAccessToken();
    clearStoredTokens();
    complete(new Response(JSON.stringify({ access_token: 'new', expires_in: 3600 })));
    await expect(refreshing).resolves.toBeNull();
    expect(localStorage.getItem(tokenKey)).toBeNull();
  });

  it('distinguishes temporary service failures from revoked sessions', async () => {
    localStorage.setItem(tokenKey, JSON.stringify(tokens));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })));
    await expect(getValidAccessToken()).rejects.toThrow('temporarily unavailable');
    expect(localStorage.getItem(tokenKey)).not.toBeNull();
    await expect(getValidAccessToken()).resolves.toBeNull();
  });

  it('does not persist incomplete token responses', async () => {
    transaction();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'access' }))));
    await expect(handleOAuthCallback('code', 'expected')).rejects.toThrow('offline credentials');
    expect(localStorage.getItem(tokenKey)).toBeNull();
  });
});
