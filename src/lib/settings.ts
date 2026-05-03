/**
 * Local-first user settings.
 * - Visible languages (danish/english/italian).
 * - External AI provider scaffolding (BYOK).
 * - Data export / hard reset utilities.
 *
 * Everything lives in localStorage; nothing is sent anywhere.
 */

import type { LexisEntry } from "@/lib/lexicon";

export type Language = "danish" | "english" | "italian";

export const ALL_LANGUAGES: Language[] = ["danish", "english", "italian"];
export const LANGUAGE_LABELS: Record<Language, string> = {
  danish: "Danish",
  english: "English",
  italian: "Italian",
};

const VISIBLE_LANGS_KEY = "ordsamling-visible-languages";
const AI_PROVIDER_KEY = "ordsamling-ai-provider";
const AI_KEY_KEY = "ordsamling-ai-key";

export type AiProvider = "cloudflare" | "openai" | "";

const DEFAULT_VISIBLE: Language[] = ["danish", "english"];

export function getVisibleLanguages(): Language[] {
  try {
    const raw = localStorage.getItem(VISIBLE_LANGS_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE;
    const filtered = parsed.filter((v): v is Language =>
      ALL_LANGUAGES.includes(v as Language),
    );
    return filtered.length > 0 ? filtered : DEFAULT_VISIBLE;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

export function setVisibleLanguages(langs: Language[]): void {
  const safe = langs.filter((l) => ALL_LANGUAGES.includes(l));
  // Always keep at least one language enabled
  const final = safe.length > 0 ? safe : DEFAULT_VISIBLE;
  localStorage.setItem(VISIBLE_LANGS_KEY, JSON.stringify(final));
  window.dispatchEvent(new CustomEvent("ordsamling:settings-changed"));
}

export function isLanguageVisible(lang: Language): boolean {
  return getVisibleLanguages().includes(lang);
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
