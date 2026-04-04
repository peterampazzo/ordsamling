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

export type LexisEntryInput = Omit<LexisEntry, "id" | "createdAt">;