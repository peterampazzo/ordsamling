import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import {
  normalizeEntryType,
  normalizeGrammar,
  normalizeTranslations,
  WORD_LIKE_TYPES,
  type EntryType,
  type LexisEntry,
  type LexisEntryInput,
} from "@/lib/lexicon";
import { getEntriesStorageKey, isDemoMode } from "@/lib/demo";

export type { EntryGrammar, EntryType, LexisEntry } from "@/lib/lexicon";

const ENTRIES_QUERY_KEY = ["entries"];

function normalizeEntry(entry: Partial<LexisEntry> & { italian?: unknown }): LexisEntry {
  // Migrate legacy `italian` field → translations.it
  const translations = normalizeTranslations(entry.translations) ?? {};
  if (typeof entry.italian === "string" && entry.italian.trim() && !translations.it) {
    translations.it = entry.italian.trim();
  }
  const hasTrans = Object.keys(translations).length > 0;
  return {
    id: entry.id || crypto.randomUUID(),
    danish: entry.danish || "",
    english: entry.english || "",
    notes: entry.notes || "",
    type: normalizeEntryType(entry.type),
    grammar: normalizeGrammar(entry.grammar),
    createdAt: typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
    ...(hasTrans ? { translations } : {}),
  };
}

function loadLocalEntries(): LexisEntry[] {
  try {
    const raw = localStorage.getItem(getEntriesStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((entry) => normalizeEntry(entry));
  } catch {
    return [];
  }
}

function saveLocalEntries(entries: LexisEntry[]) {
  localStorage.setItem(getEntriesStorageKey(), JSON.stringify(entries));
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = "Request failed.";

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Ignore JSON parsing failures and fall back to the default message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function isLocalStorageMode() {
  // Demo always runs purely from local storage and never hits the API
  if (isDemoMode()) return true;
  return import.meta.env.DEV || window.location.hostname.endsWith(".pages.dev");
}

async function fetchEntries(): Promise<LexisEntry[]> {
  if (isLocalStorageMode()) {
    return loadLocalEntries();
  }

  const response = await requestJson<{ entries: LexisEntry[] }>("/api/entries");
  const entries = response.entries.map((entry) => normalizeEntry(entry));
  saveLocalEntries(entries);
  return entries;
}

export function useLexicon() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const entriesQuery = useQuery({
    queryKey: ENTRIES_QUERY_KEY,
    queryFn: fetchEntries,
    initialData: loadLocalEntries,
  });

  const allEntries = useMemo(() => entriesQuery.data || [], [entriesQuery.data]);

  const addMutation = useMutation({
    mutationFn: async (entry: LexisEntryInput) => {
      if (isLocalStorageMode()) {
        const createdEntry = normalizeEntry({
          ...entry,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        });
        const nextEntries = [createdEntry, ...loadLocalEntries()];
        saveLocalEntries(nextEntries);
        return createdEntry;
      }

      const response = await requestJson<{ entry: LexisEntry }>("/api/entries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(entry),
      });

      return normalizeEntry(response.entry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save entry.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<LexisEntryInput> & { grammar?: LexisEntry["grammar"] | null };
    }) => {
      if (isLocalStorageMode()) {
        const nextEntries = loadLocalEntries().map((entry) => {
          if (entry.id !== id) return entry;
          const merged: LexisEntry = { ...entry, ...updates };
          if (updates.grammar === null) {
            delete merged.grammar;
          } else if (updates.grammar !== undefined) {
            merged.grammar = updates.grammar;
          }
          return normalizeEntry(merged);
        });
        saveLocalEntries(nextEntries);
        return nextEntries.find((entry) => entry.id === id) || null;
      }

      const body: Record<string, unknown> = { ...updates };
      if ("grammar" in updates) {
        body.grammar = updates.grammar === undefined || updates.grammar === null ? null : updates.grammar;
      }

      const response = await requestJson<{ entry: LexisEntry }>(`/api/entries/${id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      return normalizeEntry(response.entry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update entry.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isLocalStorageMode()) {
        const nextEntries = loadLocalEntries().filter((entry) => entry.id !== id);
        saveLocalEntries(nextEntries);
        return;
      }

      const response = await fetch(`/api/entries/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Could not delete entry.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete entry.");
    },
  });

  const addEntry = useCallback(async (entry: LexisEntryInput) => {
    await addMutation.mutateAsync(entry);
  }, [addMutation]);

  const updateEntry = useCallback(
    async (id: string, updates: Partial<LexisEntryInput> & { grammar?: LexisEntry["grammar"] | null }) => {
      await updateMutation.mutateAsync({ id, updates });
    },
    [updateMutation],
  );

  const deleteEntry = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  const findMatches = useCallback((query: string): LexisEntry[] => {
    if (!query || query.length < 2) {
      return [];
    }

    const lowerQuery = query.toLowerCase();

    return allEntries.filter((entry) => {
      const grammarHaystack = entry.grammar
        ? Object.values(entry.grammar)
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        : "";

      return (
        entry.danish.toLowerCase().includes(lowerQuery) ||
        entry.english.toLowerCase().includes(lowerQuery) ||
        entry.italian.toLowerCase().includes(lowerQuery) ||
        grammarHaystack.includes(lowerQuery)
      );
    });
  }, [allEntries]);

  const findLinkedWords = useCallback((entry: LexisEntry): LexisEntry[] => {
    if (entry.type !== "expression") {
      return [];
    }

    const words = [entry.danish, entry.english, entry.italian]
      .flatMap((text) => text.toLowerCase().split(/\s+/))
      .filter((word) => word.length > 2);

    return allEntries.filter(
      (candidate) =>
        WORD_LIKE_TYPES.has(candidate.type) &&
        candidate.id !== entry.id &&
        [candidate.danish, candidate.english, candidate.italian].some((field) =>
          words.includes(field.toLowerCase()),
        ),
    );
  }, [allEntries]);

  const filtered = useMemo(() => {
    return allEntries.filter((entry) => {
      if (!search) {
        return true;
      }

      const lowerQuery = search.toLowerCase();

      const grammarHaystack = entry.grammar
        ? Object.values(entry.grammar)
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        : "";

      return (
        entry.danish.toLowerCase().includes(lowerQuery) ||
        entry.english.toLowerCase().includes(lowerQuery) ||
        entry.italian.toLowerCase().includes(lowerQuery) ||
        entry.notes.toLowerCase().includes(lowerQuery) ||
        grammarHaystack.includes(lowerQuery)
      );
    });
  }, [allEntries, search]);

  return {
    entries: filtered,
    allEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    deleteEntry,
    findMatches,
    findLinkedWords,
    isLoading: entriesQuery.isLoading,
    isSaving: addMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
