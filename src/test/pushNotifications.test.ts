import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { urlBase64ToUint8Array, usePushNotifications } from '@/hooks/usePushNotifications';

vi.mock('@/lib/googleOAuth', () => ({
  getValidAccessToken: vi.fn(async () => 'fake-token'),
}));

const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;

function setUserAgent(ua: string) {
  Object.defineProperty(globalThis.navigator, 'userAgent', {
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
  globalThis.navigator = originalNavigator;
  globalThis.window = originalWindow;
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a known VAPID public key into 65 bytes (uncompressed P-256)', () => {
    // Sample base64url-encoded VAPID public key (65 raw bytes).
    const sample =
      'BNbnG3FzL0nP5pq1WoT0Y7CXMPdiSqGqHnXJ4-eJiTtJ7K_lTLcjnG5GwK4u3XVwAYUI5oMrr-tCfA_O3xRm9bA';
    const out = urlBase64ToUint8Array(sample);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(65);
    expect(out[0]).toBe(0x04); // uncompressed point prefix
  });
});

describe('usePushNotifications', () => {
  beforeEach(() => {
    setMatchMedia(false);
  });

  it('reports isSupported=false when service workers are unavailable', () => {
    // Strip the relevant globals.
    const navStub = { userAgent: 'Mozilla/5.0', maxTouchPoints: 0 } as Navigator;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navStub });
    const winStub = { matchMedia: window.matchMedia } as unknown as Window & typeof globalThis;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: winStub });

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

  it('subscribe() refuses without a configured VAPID key', async () => {
    // Provide just enough of a supported environment.
    const subscribeMock = vi.fn();
    const registerMock = vi.fn(async () => ({
      pushManager: {
        getSubscription: vi.fn(async () => null),
        subscribe: subscribeMock,
      },
    }));

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: registerMock,
        getRegistration: vi.fn(async () => null),
        ready: Promise.resolve({}),
      },
    });
    // @ts-expect-error test stub
    globalThis.PushManager = function PushManager() {};
    // @ts-expect-error test stub
    globalThis.Notification = { permission: 'default', requestPermission: vi.fn(async () => 'granted') };

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isSupported).toBe(true));

    await act(async () => {
      await expect(result.current.subscribe()).rejects.toThrow(/VAPID public key/);
    });
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});
