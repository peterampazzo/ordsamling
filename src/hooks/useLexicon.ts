import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import {
  normalizeEntryType,
  normalizeGrammar,
  normalizeTranslations,
  stripInfinitiveMarker,
  WORD_LIKE_TYPES,
  type EntryType,
  type LexisEntry,
  type LexisEntryInput,
} from "@/lib/lexicon";
import { DEMO_STORAGE_KEY, REAL_STORAGE_KEY } from "@/lib/demo";
import { useGoogleSheets } from "@/hooks/useGoogleSheets";

export type { EntryGrammar, EntryType, LexisEntry } from "@/lib/lexicon";

export const ENTRIES_QUERY_KEY = ["entries"];

function normalizeEntry(entry: Partial<LexisEntry> & { italian?: unknown }): LexisEntry {
  // Migrate legacy `italian` field → translations.it
  const translations = normalizeTranslations(entry.translations) ?? {};
  if (typeof entry.italian === "string" && entry.italian.trim() && !translations.it) {
    translations.it = entry.italian.trim();
  }
  const hasTrans = Object.keys(translations).length > 0;
  const type = normalizeEntryType(entry.type);
  // Strip leading "at "/"to " from verb roots so old data is consistent with display helpers.
  const danish = type === "verb" ? stripInfinitiveMarker(entry.danish || "", "da") : (entry.danish || "");
  const english = type === "verb" ? stripInfinitiveMarker(entry.english || "", "en") : (entry.english || "");
  return {
    id: entry.id || crypto.randomUUID(),
    danish,
    english,
    notes: entry.notes || "",
    type,
    grammar: normalizeGrammar(entry.grammar),
    createdAt: typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
    updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now(),
    ...(hasTrans ? { translations } : {}),
  };
}

function loadLocalEntries(storageKey: string): LexisEntry[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((entry) => normalizeEntry(entry));
  } catch {
    return [];
  }
}

function saveLocalEntries(entries: LexisEntry[], storageKey: string) {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

async function fetchEntries(storageKey: string): Promise<LexisEntry[]> {
  return loadLocalEntries(storageKey);
}

export function useLexicon({ demo = false }: { demo?: boolean } = {}) {
  const storageKey = demo ? DEMO_STORAGE_KEY : REAL_STORAGE_KEY;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { pushEntry } = useGoogleSheets();

  const entriesQuery = useQuery({
    queryKey: [...ENTRIES_QUERY_KEY, storageKey],
    queryFn: () => fetchEntries(storageKey),
    initialData: () => loadLocalEntries(storageKey),
  });

  const allEntries = useMemo(() => entriesQuery.data || [], [entriesQuery.data]);

  useEffect(() => {
    function handleEntriesSynced() {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
    }
    window.addEventListener("ordsamling:entries-synced", handleEntriesSynced);
    return () => window.removeEventListener("ordsamling:entries-synced", handleEntriesSynced);
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: async (entry: LexisEntryInput) => {
      const now = Date.now();
      const createdEntry = normalizeEntry({
        ...entry,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
      if (demo) saveLocalEntries([createdEntry, ...loadLocalEntries(storageKey)], storageKey);
      else await pushEntry(createdEntry, "add");
      return createdEntry;
    },
    onSuccess: (createdEntry) => {
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
      const now = Date.now();
      const nextEntries = loadLocalEntries(storageKey).map((entry) => {
        if (entry.id !== id) return entry;
        const merged: LexisEntry = { ...entry, ...updates, updatedAt: now };
        if (updates.grammar === null) {
          delete merged.grammar;
        } else if (updates.grammar !== undefined) {
          merged.grammar = updates.grammar;
        }
        return normalizeEntry(merged);
      });
      const updated = nextEntries.find((entry) => entry.id === id) || null;
      if (demo) saveLocalEntries(nextEntries, storageKey);
      else if (updated) await pushEntry(updated, "update");
      return updated;
    },
    onSuccess: (updatedEntry) => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update entry.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = loadLocalEntries(storageKey);
      const entry = current.find(item => item.id === id);
      if (demo) saveLocalEntries(current.filter(item => item.id !== id), storageKey);
      else if (entry) await pushEntry(entry, "delete");
      return id;
    },
    onSuccess: (id) => {
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

      const translationHaystack = entry.translations
        ? Object.values(entry.translations).join(" ").toLowerCase()
        : "";

      return (
        entry.danish.toLowerCase().includes(lowerQuery) ||
        entry.english.toLowerCase().includes(lowerQuery) ||
        translationHaystack.includes(lowerQuery) ||
        grammarHaystack.includes(lowerQuery)
      );
    });
  }, [allEntries]);

  const findLinkedWords = useCallback((entry: LexisEntry): LexisEntry[] => {
    if (entry.type !== "expression") {
      return [];
    }

    const translationValues = entry.translations ? Object.values(entry.translations) : [];
    const words = [entry.danish, entry.english, ...translationValues]
      .flatMap((text) => text.toLowerCase().split(/\s+/))
      .filter((word) => word.length > 2);

    return allEntries.filter(
      (candidate) =>
        WORD_LIKE_TYPES.has(candidate.type) &&
        candidate.id !== entry.id &&
        [
          candidate.danish,
          candidate.english,
          ...(candidate.translations ? Object.values(candidate.translations) : []),
        ].some((field) => words.includes(field.toLowerCase())),
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

      const translationHaystack = entry.translations
        ? Object.values(entry.translations).join(" ").toLowerCase()
        : "";

      return (
        entry.danish.toLowerCase().includes(lowerQuery) ||
        entry.english.toLowerCase().includes(lowerQuery) ||
        translationHaystack.includes(lowerQuery) ||
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
