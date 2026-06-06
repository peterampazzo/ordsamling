/**
 * usePushNotifications
 *
 * Cross-platform Web Push lifecycle hook. On iOS 16.4+ the underlying
 * Push API is only exposed when the app is launched from the home screen
 * (display-mode: standalone), so this hook surfaces those state booleans
 * to let the UI guide the user appropriately.
 *
 * Subscribe must be called from inside a user gesture handler.
 */

import { useCallback, useEffect, useState } from 'react';
import { getValidAccessToken } from '@/lib/googleOAuth';

const SW_PATH = '/sw.js';

export interface PushNotificationsState {
  isSupported: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | 'unsupported';
  subscription: PushSubscription | null;
  loading: boolean;
  error: string | null;
}

/**
 * Convert a standard base64url-encoded VAPID public key into the raw
 * Uint8Array form required by `pushManager.subscribe`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPad on iPadOS reports as Mac; treat touch-enabled Mac as iOS too.
  const isIPad =
    /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || isIPad;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* ignore */
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function detectSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function postSubscription(
  endpoint: string,
  sub: PushSubscription,
  token: string,
): Promise<void> {
  const json = sub.toJSON();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });
  if (!res.ok) {
    throw new Error(`register failed: ${res.status}`);
  }
}

async function deleteSubscription(endpoint: string, token: string): Promise<void> {
  await fetch('/api/notifications/register', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {
    /* best effort */
  });
}

export function usePushNotifications(): PushNotificationsState & {
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [isSupported] = useState<boolean>(() => detectSupported());
  const [isIOS] = useState<boolean>(() => detectIOS());
  const [isStandalone, setIsStandalone] = useState<boolean>(() => detectStandalone());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    detectSupported() ? Notification.permission : 'unsupported',
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupported) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      if (!reg) {
        setSubscription(null);
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      setSubscription(existing);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [isSupported]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = () => setIsStandalone(detectStandalone());
    try {
      mq.addEventListener('change', handler);
    } catch {
      mq.addListener?.(handler);
    }
    return () => {
      try {
        mq.removeEventListener('change', handler);
      } catch {
        mq.removeListener?.(handler);
      }
    };
  }, []);

  useEffect(() => {
    if (isSupported && isStandalone) {
      void refresh();
    }
  }, [isSupported, isStandalone, refresh]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      throw new Error('Push notifications are not supported in this browser.');
    }
    setLoading(true);
    setError(null);
    try {
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured.');
      }

      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('Sign in with Google first to enable reminders.');
      }

      const reg = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        throw new Error('Notification permission was not granted.');
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      await postSubscription('/api/notifications/register', sub, token);
      setSubscription(sub);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const token = await getValidAccessToken();
        if (token) await deleteSubscription(sub.endpoint, token);
        await sub.unsubscribe();
      }
      setSubscription(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    isIOS,
    isStandalone,
    permission,
    subscription,
    loading,
    error,
    subscribe,
    unsubscribe,
    refresh,
  };
}
