import da from "./da.yaml";
import en from "./en.yaml";

type StringTree = Record<string, unknown>;
const strings: Record<string, StringTree> = { da, en };

const LANG_KEY = "ordsamling-lang";

function detectInitialLang(): string {
  if (typeof window === "undefined") return "da";
  const stored = localStorage.getItem(LANG_KEY);
  if (stored && strings[stored]) return stored;
  return "da";
}

let currentLang = detectInitialLang();

export function setLang(lang: string) {
  if (!strings[lang]) return;
  currentLang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
    window.dispatchEvent(new CustomEvent("ordsamling:lang-changed"));
  } catch { /* ignore */ }
}

export function getLang() {
  return currentLang;
}

export const AVAILABLE_LANGS = ["da", "en"] as const;

/**
 * Retrieve a UI string by dot-separated key path.
 *
 * Supports simple `{placeholder}` interpolation:
 *   t("common.wordCount", { count: 42 })  →  "42 ord"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const parts = key.split(".");
  let node: unknown = strings[currentLang];

  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      // Fallback: return key itself so missing translations are visible
      console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
  }

  if (typeof node !== "string") {
    console.warn(`[i18n] key is not a string: ${key}`);
    return key;
  }

  if (!params) return node;

  return node.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}
