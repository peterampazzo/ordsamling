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

createRoot(document.getElementById("root")!).render(<App />);
