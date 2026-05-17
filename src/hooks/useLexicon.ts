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

// Task 8.5 — always use localStorage, no KV API branch
async function fetchEntries(storageKey: string): Promise<LexisEntry[]> {
  return loadLocalEntries(storageKey);
}

export function useLexicon({ demo = false }: { demo?: boolean } = {}) {
  const storageKey = demo ? DEMO_STORAGE_KEY : REAL_STORAGE_KEY;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Task 8.1 — call useGoogleSheets internally to get pushEntry and syncNow
  const { pushEntry, syncNow } = useGoogleSheets();

  const entriesQuery = useQuery({
    queryKey: ENTRIES_QUERY_KEY,
    queryFn: () => fetchEntries(storageKey),
    initialData: () => loadLocalEntries(storageKey),
  });

  const allEntries = useMemo(() => entriesQuery.data || [], [entriesQuery.data]);

  // Task 8.6 — trigger syncNow on mount (no-op if not in cloud sync mode, no-op in demo)
  useEffect(() => {
    if (!demo) void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Task 8.6 — listen for entries-synced event and invalidate React Query cache
  useEffect(() => {
    function handleEntriesSynced() {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
    }
    window.addEventListener("ordsamling:entries-synced", handleEntriesSynced);
    return () => window.removeEventListener("ordsamling:entries-synced", handleEntriesSynced);
  }, [queryClient]);

  // Task 8.5 — always use localStorage path (no isLocalStorageMode branch)
  const addMutation = useMutation({
    mutationFn: async (entry: LexisEntryInput) => {
      const now = Date.now();
      const createdEntry = normalizeEntry({
        ...entry,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
      const nextEntries = [createdEntry, ...loadLocalEntries(storageKey)];
      saveLocalEntries(nextEntries, storageKey);
      return createdEntry;
    },
    onSuccess: (createdEntry) => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
      // Task 8.2 — push to Sheets after add (skipped in demo)
      if (!demo) pushEntry(createdEntry, "add");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save entry.");
    },
  });

  // Task 8.5 — always use localStorage path (no isLocalStorageMode branch)
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
      saveLocalEntries(nextEntries, storageKey);
      return nextEntries.find((entry) => entry.id === id) || null;
    },
    onSuccess: (updatedEntry) => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
      // Task 8.3 — push to Sheets after update (skipped in demo)
      if (!demo && updatedEntry !== null) {
        pushEntry(updatedEntry, "update");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update entry.");
    },
  });

  // Task 8.5 — always use localStorage path (no isLocalStorageMode branch)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const nextEntries = loadLocalEntries(storageKey).filter((entry) => entry.id !== id);
      saveLocalEntries(nextEntries, storageKey);
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
      // Task 8.4 — push to Sheets after delete (skipped in demo)
      if (!demo) {
        pushEntry(
          { id, danish: "", english: "", notes: "", type: "word" as const, createdAt: 0, updatedAt: 0 },
          "delete",
        );
      }
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
