import { afterEach, describe, expect, it, vi } from 'vitest';
import { retirePushWorker } from '@/lib/retirePush';

afterEach(() => vi.restoreAllMocks());

describe('Retiring the unused push worker', () => {
  function registration(script = '/sw.js', scope = '/') {
    return {
      scope: new URL(scope, window.location.origin).href,
      active: { scriptURL: new URL(script, window.location.origin).href },
      pushManager: { getSubscription: vi.fn().mockResolvedValue({ unsubscribe: vi.fn().mockResolvedValue(true) }) },
      unregister: vi.fn().mockResolvedValue(true),
    };
  }

  it('unsubscribes and unregisters only the original root worker', async () => {
    const old = registration(), unrelated = registration('/other.js'), otherScope = registration('/sw.js', '/other/');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true, value: { getRegistrations: vi.fn().mockResolvedValue([old, unrelated, otherScope]) },
    });
    await retirePushWorker();
    const subscription = await old.pushManager.getSubscription();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(old.unregister).toHaveBeenCalledTimes(1);
    expect(unrelated.unregister).not.toHaveBeenCalled();
    expect(otherScope.unregister).not.toHaveBeenCalled();
  });

  it('still unregisters if unsubscribe fails', async () => {
    const old = registration();
    old.pushManager.getSubscription.mockRejectedValue(new Error('Unavailable'));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true, value: { getRegistrations: vi.fn().mockResolvedValue([old]) },
    });
    await expect(retirePushWorker()).resolves.toBeUndefined();
    expect(old.unregister).toHaveBeenCalledTimes(1);
  });
});
