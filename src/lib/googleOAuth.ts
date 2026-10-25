/**
 * Google OAuth2 PKCE flow helpers.
 * Handles authorization, token exchange, refresh, revocation, and storage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthResult {
  accessToken: string;
  refreshToken: string;
  email: string;
  tokenExpiry: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Storage keys (internal)
// ---------------------------------------------------------------------------

const VERIFIER_KEY = 'ordsamling-oauth-verifier';
const TOKEN_KEY = 'ordsamling-oauth-tokens';
const TRANSACTION_KEY = 'ordsamling-oauth-transaction';
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
let refreshInFlight: Promise<string | null> | null = null;

async function tokenRequest(body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch('/api/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal, cache: 'no-store',
    });
  } finally {
    clearTimeout(timeout);
  }
}

function validTokenData(value: unknown): value is { access_token: string; expires_in: number; refresh_token?: string } {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.access_token === 'string' && data.access_token.length > 0 &&
    typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) && data.expires_in > 0;
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  email: string;
  tokenExpiry: number;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/** Encode a Uint8Array to base64url (no padding). */
function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Generate a random base64url-encoded string of the given byte length. */
function generateRandomBase64url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

/** Compute SHA-256 of a string and return base64url-encoded result (no padding). */
async function sha256Base64url(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(hashBuffer));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initiates the Google OAuth2 PKCE flow.
 * Generates a code verifier, stores it in sessionStorage, and redirects
 * the browser to Google's authorization endpoint.
 */
export async function initiateOAuthFlow(): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured for this build.');
  // Generate a 64-character (48-byte) random code verifier
  const codeVerifier = generateRandomBase64url(48);

  // Compute the code challenge (SHA-256 of verifier, base64url encoded)
  const codeChallenge = await sha256Base64url(codeVerifier);

  const state = generateRandomBase64url(32);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify({ codeVerifier, state, createdAt: Date.now() }));

  // Build the authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    state,
    redirect_uri: window.location.origin + '/oauth/callback',
    response_type: 'code',
    scope:
      'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  window.location.href = authUrl;
}

/**
 * Handles the OAuth2 callback by exchanging the authorization code for tokens.
 * Fetches the user's email, stores token metadata in localStorage, and returns
 * the OAuth result.
 */
export async function handleOAuthCallback(code: string, state: string | null): Promise<OAuthResult> {
  const raw = sessionStorage.getItem(TRANSACTION_KEY);
  let transaction: { codeVerifier?: string; state?: string; createdAt?: number } | null;
  try { transaction = raw ? JSON.parse(raw) : null; } catch { transaction = null; }
  if (!code || !state || !transaction || state !== transaction.state ||
    typeof transaction.codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(transaction.codeVerifier) ||
    typeof transaction.createdAt !== 'number' || Date.now() - transaction.createdAt > TRANSACTION_TTL_MS ||
    transaction.createdAt > Date.now()) {
    throw new Error('Invalid or expired Google sign-in. Please connect again.');
  }
  const { codeVerifier } = transaction;
  sessionStorage.removeItem(TRANSACTION_KEY);

  // Exchange authorization code for tokens via our server-side proxy
  // (keeps the client secret out of the browser bundle)
  const tokenResponse = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: window.location.origin + '/oauth/callback',
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.json().catch(() => ({}));
    const message =
      (errorBody as { error_description?: string; error?: string }).error_description ||
      (errorBody as { error_description?: string; error?: string }).error ||
      `Token exchange failed: ${tokenResponse.status}`;
    throw new Error(message);
  }

  const tokenData: unknown = await tokenResponse.json();
  if (!validTokenData(tokenData) || typeof tokenData.refresh_token !== 'string' || !tokenData.refresh_token) {
    throw new Error('Google did not return valid offline credentials. Please connect again.');
  }

  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = tokenData;

  // Fetch user info to get email
  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoResponse.ok) throw new Error('Could not verify the Google account.');
  const userInfo = (await userInfoResponse.json()) as { email: string };
  const email = userInfo.email;
  if (typeof email !== 'string' || !email.includes('@')) throw new Error('Google did not return a valid account email.');

  const tokenExpiry = Date.now() + expiresIn * 1000;

  // Store tokens in localStorage
  const stored: StoredTokens = { accessToken, refreshToken, email, tokenExpiry };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));

  // Clear the verifier from sessionStorage
  sessionStorage.removeItem(VERIFIER_KEY);

  return { accessToken, refreshToken, email, tokenExpiry };
}

/**
 * Returns a valid access token, refreshing silently if needed.
 * Returns null when reconnecting is required; temporary failures are thrown.
 */
export async function getValidAccessToken(): Promise<string | null> {
  let stored: StoredTokens | null = null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    stored = JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }

  if (!stored) return null;

  // Return cached token if it has more than 1 minute of validity left
  if (stored.tokenExpiry > Date.now() + 60_000) {
    return stored.accessToken;
  }

  if (!stored.refreshToken) return null;
  if (refreshInFlight) return refreshInFlight;

  // Attempt silent refresh via server-side proxy
  const original = localStorage.getItem(TOKEN_KEY);
  refreshInFlight = (async () => {
    const refreshResponse = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: stored!.refreshToken,
    });
    if (!refreshResponse.ok) {
      const error = await refreshResponse.json().catch(() => ({})) as { error?: string };
      if (error.error === 'invalid_grant') return null;
      throw new Error('Google sign-in is temporarily unavailable. Your changes remain on this device.');
    }
    const refreshData: unknown = await refreshResponse.json();
    if (!validTokenData(refreshData)) throw new Error('Invalid token refresh response.');

    const newAccessToken = refreshData.access_token;
    const newTokenExpiry = Date.now() + refreshData.expires_in * 1000;

    // Update stored tokens
    if (localStorage.getItem(TOKEN_KEY) !== original) {
      const latest = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as StoredTokens | null;
      return latest && latest.tokenExpiry > Date.now() + 60_000 ? latest.accessToken : null;
    }
    const updated: StoredTokens = {
      ...stored!,
      accessToken: newAccessToken,
      tokenExpiry: newTokenExpiry,
      ...(typeof refreshData.refresh_token === 'string' && refreshData.refresh_token ? { refreshToken: refreshData.refresh_token } : {}),
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(updated));

    return newAccessToken;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

/**
 * Revokes the given OAuth token and clears stored tokens from localStorage.
 * Does not throw on revoke failure (best-effort).
 */
export async function revokeOAuthToken(token: string): Promise<void> {
  const original = localStorage.getItem(TOKEN_KEY);
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
  } catch {
    // Best-effort — ignore revoke failures
  } finally {
    if (localStorage.getItem(TOKEN_KEY) === original) clearStoredTokens();
  }
}

/**
 * Returns the stored email address, or null if no tokens are stored.
 */
export function getStoredEmail(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredTokens;
    return stored.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Removes stored OAuth tokens from localStorage.
 */
export function clearStoredTokens(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Silently ignore
  }
}
