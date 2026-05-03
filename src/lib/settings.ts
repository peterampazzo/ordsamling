/**
 * Local-first user settings.
 * - Core languages: Danish + English (always on).
 * - Extra languages: any subset of LANGUAGE_CATALOG, identified by ISO 639-1 code.
 *   Stored on each LexisEntry as `translations: { [code]: text }`.
 * - External AI provider scaffolding (BYOK), still preview-only.
 *
 * Everything lives in localStorage; nothing is sent anywhere.
 */

import type { LexisEntry } from "@/lib/lexicon";

/** Core languages are baked into the entry shape and always active. */
export const CORE_LANGUAGES = ["danish", "english"] as const;
export type CoreLanguage = (typeof CORE_LANGUAGES)[number];

/** Extra optional languages, identified by ISO 639-1 code. */
export interface ExtraLanguage {
  code: string;
  /** Native or commonly-used label, shown in UI. */
  label: string;
}

export const LANGUAGE_CATALOG: ExtraLanguage[] = [
  { code: "it", label: "Italiano" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "sv", label: "Svenska" },
  { code: "no", label: "Norsk" },
  { code: "fi", label: "Suomi" },
  { code: "is", label: "Íslenska" },
  { code: "pl", label: "Polski" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

export function getLanguageLabel(code: string): string {
  return LANGUAGE_CATALOG.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

const EXTRA_LANGS_KEY = "ordsamling-extra-languages";
const AI_PROVIDER_KEY = "ordsamling-ai-provider";
const AI_KEY_KEY = "ordsamling-ai-key";

export type AiProvider = "cloudflare" | "openai" | "";

/** Codes of currently-enabled extra languages, in user-defined order. */
export function getExtraLanguages(): string[] {
  try {
    const raw = localStorage.getItem(EXTRA_LANGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is string => typeof c === "string" && LANGUAGE_CATALOG.some((l) => l.code === c),
    );
  } catch {
    return [];
  }
}

export function setExtraLanguages(codes: string[]): void {
  const safe = codes.filter((c) => LANGUAGE_CATALOG.some((l) => l.code === c));
  localStorage.setItem(EXTRA_LANGS_KEY, JSON.stringify(safe));
  window.dispatchEvent(new CustomEvent("ordsamling:settings-changed"));
}

export function isExtraLanguageEnabled(code: string): boolean {
  return getExtraLanguages().includes(code);
}

export function getAiProvider(): AiProvider {
  const v = localStorage.getItem(AI_PROVIDER_KEY) ?? "";
  if (v === "openai" || v === "cloudflare") return v;
  return "";
}

export function setAiProvider(p: AiProvider): void {
  if (p) localStorage.setItem(AI_PROVIDER_KEY, p);
  else localStorage.removeItem(AI_PROVIDER_KEY);
}

export function getAiKey(): string {
  return localStorage.getItem(AI_KEY_KEY) ?? "";
}

export function setAiKey(key: string): void {
  if (key) localStorage.setItem(AI_KEY_KEY, key);
  else localStorage.removeItem(AI_KEY_KEY);
}

/* ---------- Data tools ---------- */

export function exportEntriesAsJson(entries: LexisEntry[]): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ordsamling-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Wipe ALL local data: entries, settings, demo, quiz history. */
export function resetAllLocalData(): void {
  const prefixes = ["lexikon-", "ordsamling-"];
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
  sessionStorage.removeItem("ordsamling-demo-route");
}
