import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getLang } from "./i18n";

// Sync <html lang> with current i18n language for screen readers & SEO.
const syncHtmlLang = () => {
  document.documentElement.lang = getLang();
};
syncHtmlLang();
window.addEventListener("ordsamling:lang-changed", syncHtmlLang);

// Register the Web Push service worker — only in production builds and only
// outside the Lovable preview iframe. The worker is push-only (no app-shell
// caching), so it won't serve stale HTML.
if (
  import.meta.env.PROD &&
  typeof window !== "undefined" &&
  window.top === window &&
  "serviceWorker" in navigator
) {
  const host = window.location.hostname;
  const isPreview =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovableproject-dev.com");
  if (!isPreview) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* best effort */
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
