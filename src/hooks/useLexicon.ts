import { useState, useEffect, useCallback } from "react";

export interface LexisEntry {
  id: string;
  danish: string;
  english: string;
  italian: string;
  notes: string;
  createdAt: number;
}

const STORAGE_KEY = "lexikon-entries";

function loadEntries(): LexisEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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

  return { entries: filtered, allEntries: entries, search, setSearch, addEntry, updateEntry, deleteEntry };
}
