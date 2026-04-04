import { useState, useEffect, useCallback } from "react";

export type EntryType = "word" | "expression";

export interface LexisEntry {
  id: string;
  danish: string;
  english: string;
  italian: string;
  notes: string;
  type: EntryType;
  createdAt: number;
}

const STORAGE_KEY = "lexikon-entries";

function loadEntries(): LexisEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // migrate old entries without type
    return parsed.map((e: any) => ({ ...e, type: e.type || "word" }));
  } catch {
    return [];
  }
}

export function useLexicon() {
  const [entries, setEntries] = useState<LexisEntry[]>(loadEntries);
  const [search, setSearch] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const addEntry = useCallback((entry: Omit<LexisEntry, "id" | "createdAt">) => {
    setEntries((prev) => [
      { ...entry, id: crypto.randomUUID(), createdAt: Date.now() },
      ...prev,
    ]);
  }, []);

  const updateEntry = useCallback((id: string, updates: Partial<Omit<LexisEntry, "id" | "createdAt">>) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  /** Find entries matching a partial query across all language fields */
  const findMatches = useCallback((query: string): LexisEntry[] => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return entries.filter(
      (e) =>
        e.danish.toLowerCase().includes(q) ||
        e.english.toLowerCase().includes(q) ||
        e.italian.toLowerCase().includes(q)
    );
  }, [entries]);

  /** Find single-word entries that appear within an expression's text */
  const findLinkedWords = useCallback((entry: LexisEntry): LexisEntry[] => {
    if (entry.type !== "expression") return [];
    const words = [entry.danish, entry.english, entry.italian]
      .flatMap((t) => t.toLowerCase().split(/\s+/))
      .filter((w) => w.length > 2);
    return entries.filter(
      (e) =>
        e.type === "word" &&
        e.id !== entry.id &&
        [e.danish, e.english, e.italian].some((field) =>
          words.includes(field.toLowerCase())
        )
    );
  }, [entries]);

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.danish.toLowerCase().includes(q) ||
      e.english.toLowerCase().includes(q) ||
      e.italian.toLowerCase().includes(q) ||
      e.notes.toLowerCase().includes(q)
    );
  });

  return { entries: filtered, allEntries: entries, search, setSearch, addEntry, updateEntry, deleteEntry, findMatches, findLinkedWords };
}
