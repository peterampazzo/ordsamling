import type { LexisEntry } from './lexicon';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function sameContent(a: LexisEntry | null | undefined, b: LexisEntry | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const content = (entry: LexisEntry) => [
    entry.danish, entry.english, entry.notes || '', entry.type,
    stableValue(entry.grammar ?? {}), stableValue(entry.translations ?? {}),
  ];
  return JSON.stringify(content(a)) === JSON.stringify(content(b));
}

function completeness(entry: LexisEntry): number {
  return [
    entry.danish, entry.english, entry.notes,
    ...Object.values(entry.grammar ?? {}),
    ...Object.values(entry.translations ?? {}),
  ].filter(value => typeof value === 'string' && value.trim()).length;
}

export function dedupeEntries(entries: LexisEntry[]): LexisEntry[] {
  const result = new Map<string, LexisEntry>();
  for (const entry of entries) {
    const previous = result.get(entry.id);
    if (!previous || entry.updatedAt > previous.updatedAt ||
      (entry.updatedAt === previous.updatedAt && completeness(entry) > completeness(previous))) {
      result.set(entry.id, entry);
    }
  }
  return [...result.values()];
}

export interface MergeOptions {
  pendingIds?: ReadonlySet<string>;
  deleteMissing?: boolean;
}

export function mergeSheetsIntoLocal(
  localEntries: LexisEntry[],
  sheetEntries: LexisEntry[],
  opts: MergeOptions = {},
): LexisEntry[] {
  const pending = opts.pendingIds ?? new Set<string>();
  const remote = new Map(dedupeEntries(sheetEntries).map(entry => [entry.id, entry]));
  const local = new Map(dedupeEntries(localEntries).map(entry => [entry.id, entry]));
  const merged: LexisEntry[] = [];
  for (const entry of local.values()) {
    const sheet = remote.get(entry.id);
    if (pending.has(entry.id)) merged.push(entry);
    else if (!sheet) {
      if (!opts.deleteMissing) merged.push(entry);
    } else if (sheet.updatedAt > entry.updatedAt ||
      (sheet.updatedAt === entry.updatedAt && !sameContent(sheet, entry))) {
      merged.push(sheet);
    } else merged.push(entry);
  }
  for (const entry of remote.values()) {
    if (!local.has(entry.id) && !pending.has(entry.id)) merged.push(entry);
  }
  return merged;
}

export function detectConflict(localDirty: boolean, remoteUpdatedAt: number | null, lastSyncAt: number | null): boolean {
  return localDirty && remoteUpdatedAt != null && lastSyncAt != null && remoteUpdatedAt > lastSyncAt;
}
