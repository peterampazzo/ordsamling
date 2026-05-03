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
  // Generate a 64-character (48-byte) random code verifier
  const codeVerifier = generateRandomBase64url(48);

  // Compute the code challenge (SHA-256 of verifier, base64url encoded)
  const codeChallenge = await sha256Base64url(codeVerifier);

  // Store verifier for use in the callback
  sessionStorage.setItem(VERIFIER_KEY, codeVerifier);

  // Build the authorization URL
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
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
export async function handleOAuthCallback(code: string): Promise<OAuthResult> {
  const codeVerifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!codeVerifier) {
    throw new Error('No OAuth verifier found. Please try connecting again.');
  }

  // Exchange authorization code for tokens via our server-side proxy
  // (keeps the client secret out of the browser bundle)
  const tokenResponse = await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: window.location.origin + '/oauth/callback',
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.json().catch(() => ({}));
    const message =
      (errorBody as { error_description?: string; error?: string }).error_description ||
      (errorBody as { error_description?: string; error?: string }).error ||
      `Token exchange failed: ${tokenResponse.status}`;
    throw new Error(message);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = tokenData;

  // Fetch user info to get email
  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const userInfo = (await userInfoResponse.json()) as { email: string };
  const email = userInfo.email;

  const tokenExpiry = Date.now() + expiresIn * 1000;

  // Store tokens in localStorage
  const stored: StoredTokens = { accessToken, refreshToken, email, tokenExpiry };
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
  } catch {
    // Silently ignore storage failures
  }

  // Clear the verifier from sessionStorage
  sessionStorage.removeItem(VERIFIER_KEY);

  return { accessToken, refreshToken, email, tokenExpiry };
}

/**
 * Returns a valid access token, refreshing silently if needed.
 * Returns null if no tokens are stored or if refresh fails.
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

  // Attempt silent refresh via server-side proxy
  try {
    const refreshResponse = await fetch('/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
      }),
    });

    if (!refreshResponse.ok) return null;

    const refreshData = (await refreshResponse.json()) as {
      access_token: string;
      expires_in: number;
    };

    const newAccessToken = refreshData.access_token;
    const newTokenExpiry = Date.now() + refreshData.expires_in * 1000;

    // Update stored tokens
    const updated: StoredTokens = {
      ...stored,
      accessToken: newAccessToken,
      tokenExpiry: newTokenExpiry,
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(updated));

    return newAccessToken;
  } catch {
    return null;
  }
}

/**
 * Revokes the given OAuth token and clears stored tokens from localStorage.
 * Does not throw on revoke failure (best-effort).
 */
export async function revokeOAuthToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
  } catch {
    // Best-effort — ignore revoke failures
  } finally {
    clearStoredTokens();
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
