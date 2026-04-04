import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import type { EntryType, LexisEntry, LexisEntryInput } from "@/lib/lexicon";

export type { EntryType, LexisEntry } from "@/lib/lexicon";

const STORAGE_KEY = "lexikon-entries";
const ENTRIES_QUERY_KEY = ["entries"];

function normalizeEntry(entry: Partial<LexisEntry>): LexisEntry {
  return {
    id: entry.id || crypto.randomUUID(),
    danish: entry.danish || "",
    english: entry.english || "",
    italian: entry.italian || "",
    notes: entry.notes || "",
    type: entry.type === "expression" ? "expression" : "word",
    createdAt: typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
  };
}

function loadLocalEntries(): LexisEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
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

let apiSupport: boolean | null = null;

async function hasApiSupport() {
  if (apiSupport !== null) {
    return apiSupport;
  }

  try {
    const response = await fetch("/api/entries");
    apiSupport = response.ok;
  } catch {
    apiSupport = false;
  }

  return apiSupport;
}

async function fetchEntries(): Promise<LexisEntry[]> {
  try {
    const response = await requestJson<{ entries: LexisEntry[] }>("/api/entries");
    const entries = response.entries.map((entry) => normalizeEntry(entry));
    saveLocalEntries(entries);
    apiSupport = true;
    return entries;
  } catch (error) {
    if (import.meta.env.DEV) {
      apiSupport = false;
      return loadLocalEntries();
    }

    throw error;
  }
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
      if (import.meta.env.DEV && !(await hasApiSupport())) {
        const createdEntry = normalizeEntry({
          ...entry,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        });
        const nextEntries = [createdEntry, ...loadLocalEntries()];
        saveLocalEntries(nextEntries);
        return createdEntry;
      }

      apiSupport = true;
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
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<LexisEntryInput> }) => {
      if (import.meta.env.DEV && !(await hasApiSupport())) {
        const nextEntries = loadLocalEntries().map((entry) =>
          entry.id === id ? normalizeEntry({ ...entry, ...updates }) : entry,
        );
        saveLocalEntries(nextEntries);
        return nextEntries.find((entry) => entry.id === id) || null;
      }

      apiSupport = true;
      const response = await requestJson<{ entry: LexisEntry }>(`/api/entries/${id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(updates),
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
      if (import.meta.env.DEV && !(await hasApiSupport())) {
        const nextEntries = loadLocalEntries().filter((entry) => entry.id !== id);
        saveLocalEntries(nextEntries);
        return;
      }

      apiSupport = true;
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

  const updateEntry = useCallback(async (id: string, updates: Partial<LexisEntryInput>) => {
    await updateMutation.mutateAsync({ id, updates });
  }, [updateMutation]);

  const deleteEntry = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  const findMatches = useCallback((query: string): LexisEntry[] => {
    if (!query || query.length < 2) {
      return [];
    }

    const lowerQuery = query.toLowerCase();

    return allEntries.filter(
      (entry) =>
        entry.danish.toLowerCase().includes(lowerQuery) ||
        entry.english.toLowerCase().includes(lowerQuery) ||
        entry.italian.toLowerCase().includes(lowerQuery),
    );
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
        candidate.type === "word" &&
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

      return (
        entry.danish.toLowerCase().includes(lowerQuery) ||
        entry.english.toLowerCase().includes(lowerQuery) ||
        entry.italian.toLowerCase().includes(lowerQuery) ||
        entry.notes.toLowerCase().includes(lowerQuery)
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
