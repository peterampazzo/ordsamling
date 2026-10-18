export async function retirePushWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(registrations.map(async registration => {
    if (registration.scope !== `${window.location.origin}/`) return;
    const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean);
    if (!workers.length || !workers.every(worker => worker.scriptURL === `${window.location.origin}/sw.js`)) return;
    try {
      const subscription = await registration.pushManager?.getSubscription();
      await subscription?.unsubscribe();
    } finally {
      await registration.unregister();
    }
  }));
}
