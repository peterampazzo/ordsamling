/** Update the installed-PWA app badge with the due-word count. No-op where unsupported. */
export function updateAppBadge(count: number): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    if (count > 0) void nav.setAppBadge(count).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    // Unsupported environment — ignore.
  }
}
