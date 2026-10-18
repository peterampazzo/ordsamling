import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getLang } from "./i18n";
import { retirePushWorker } from "./lib/retirePush";

// Sync <html lang> with current i18n language for screen readers & SEO.
const syncHtmlLang = () => {
  document.documentElement.lang = getLang();
};
syncHtmlLang();
window.addEventListener("ordsamling:lang-changed", syncHtmlLang);

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
      retirePushWorker().catch(() => {
        /* best effort */
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
