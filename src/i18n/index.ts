import da from "./da.yaml";

// Currently only Danish is active. To add a new language:
// 1. Create src/i18n/<lang>.yaml copying da.yaml's structure
// 2. Import it here and add it to the `strings` map
// 3. Switch `currentLang` or make it dynamic

type StringTree = Record<string, unknown>;
const strings: Record<string, StringTree> = { da };

let currentLang = "da";

export function setLang(lang: string) {
  if (strings[lang]) currentLang = lang;
}

export function getLang() {
  return currentLang;
}

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
