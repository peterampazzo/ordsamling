import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { urlBase64ToUint8Array, usePushNotifications } from '@/hooks/usePushNotifications';

vi.mock('@/lib/googleOAuth', () => ({
  getValidAccessToken: vi.fn(async () => 'fake-token'),
}));

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  });
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setUserAgent('Mozilla/5.0');
  setMatchMedia(false);
  delete (window.navigator as Navigator & { serviceWorker?: unknown }).serviceWorker;
  delete (globalThis as Record<string, unknown>).PushManager;
  delete (globalThis as Record<string, unknown>).Notification;
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a 65-byte uncompressed P-256 VAPID public key', () => {
    const sample =
      'BNbnG3FzL0nP5pq1WoT0Y7CXMPdiSqGqHnXJ4-eJiTtJ7K_lTLcjnG5GwK4u3XVwAYUI5oMrr-tCfA_O3xRm9bA';
    const out = urlBase64ToUint8Array(sample);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(65);
    expect(out[0]).toBe(0x04);
  });

  it('round-trips simple ASCII through base64url padding logic', () => {
    // base64url of "hello" = aGVsbG8 (no padding)
    const out = urlBase64ToUint8Array('aGVsbG8');
    expect(new TextDecoder().decode(out)).toBe('hello');
  });
});

describe('usePushNotifications', () => {
  beforeEach(() => {
    setMatchMedia(false);
  });

  it('reports isSupported=false when PushManager/Notification globals are missing', () => {
    // Default jsdom: no PushManager, no Notification, no serviceWorker.
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.permission).toBe('unsupported');
  });

  it('detects iPhone + non-standalone (Add to Home Screen prompt needed)', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    );
    setMatchMedia(false);
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isIOS).toBe(true);
    expect(result.current.isStandalone).toBe(false);
  });

  it('subscribe() throws without a configured VAPID key', async () => {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => null),
            subscribe: vi.fn(),
          },
        })),
        getRegistration: vi.fn(async () => null),
        ready: Promise.resolve({}),
      },
    });
    // @ts-expect-error test stub
    globalThis.PushManager = function PushManager() {};
    // @ts-expect-error test stub
    globalThis.Notification = {
      permission: 'default',
      requestPermission: vi.fn(async () => 'granted'),
    };

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isSupported).toBe(true));

    await act(async () => {
      await expect(result.current.subscribe()).rejects.toThrow(/VAPID public key/);
    });
  });
});
