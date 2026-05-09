/**
 * Shared parsing utilities for bulk import.
 * These functions are extracted from BulkImport.tsx so they can be reused
 * in StructuredImportSection and other components.
 */

import { ENTRY_TYPES, entryTypeLabel, normalizeEntryType, type EntryType } from '@/lib/lexicon';
import type { LexisEntryInput } from '@/lib/lexicon';
import { t } from '@/i18n';
import type { ParsedRow } from './types';

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function detectDelimiter(text: string): 'tab' | 'comma' {
  const firstLine = text.split('\n')[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount >= commaCount ? 'tab' : 'comma';
}

export function splitLine(line: string, delimiter: 'tab' | 'comma'): string[] {
  if (delimiter === 'tab') {
    return line.split('\t').map((f) => f.trim());
  }
  return splitCsvLine(line);
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

export const KNOWN_COLUMNS = [
  'danish', 'english', 'type', 'notes',
  'article', 'singularDefinite', 'pluralIndefinite', 'pluralDefinite',
  'present', 'past', 'perfect',
  'neuter', 'definite', 'plural', 'comparative', 'superlative',
] as const;

export type KnownColumn = (typeof KNOWN_COLUMNS)[number];

/** Returns either a known column key, a `translations.<code>` key, or null. */
export function normalizeHeader(raw: string): KnownColumn | `translations.${string}` | null {
  const original = raw.trim();
  const s = original.toLowerCase().replace(/[\s_-]/g, '');
  const map: Record<string, KnownColumn> = {
    danish: 'danish', dansk: 'danish', da: 'danish',
    english: 'english', engelsk: 'english', en: 'english',
    type: 'type', type_: 'type', ordklasse: 'type',
    notes: 'notes', noter: 'notes', note: 'notes', comment: 'notes', comments: 'notes',
    article: 'article', artikel: 'article',
    singulardefinite: 'singularDefinite', bestemtental: 'singularDefinite',
    pluralindefinite: 'pluralIndefinite', ubestemtflertal: 'pluralIndefinite',
    pluraldefinite: 'pluralDefinite', bestemtflertal: 'pluralDefinite',
    present: 'present', nutid: 'present',
    past: 'past', datid: 'past',
    perfect: 'perfect', perfektum: 'perfect',
    neuter: 'neuter', tform: 'neuter',
    definite: 'definite', bestemtform: 'definite',
    plural: 'plural', flertal: 'plural',
    comparative: 'comparative', komparativ: 'comparative',
    superlative: 'superlative', superlativ: 'superlative',
  };
  if (map[s]) return map[s];

  // translations.<code> or translation.<code>
  const dotMatch = original.toLowerCase().match(/^translations?\.([a-z]{2,3})$/);
  if (dotMatch) return `translations.${dotMatch[1]}`;
  // Bare ISO 2-3 letter code, but skip the ones we already use as known cols
  // Also skip "id" which is a UUID field, not a language code
  if (/^[a-z]{2,3}$/.test(s) && !['da', 'en', 'id'].includes(s)) {
    return `translations.${s}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export type DetectedFormat = 'csv' | 'json' | 'jsonl';

export function detectFormat(text: string): DetectedFormat | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // JSON array or object
  if (trimmed[0] === '[' || trimmed[0] === '{') {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // might be JSONL — check below
    }
  }

  // JSONL: every non-empty line is a JSON object
  const lines = trimmed
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '');

  if (lines.length > 0 && lines.every((line) => {
    const s = line.trim();
    return s.startsWith('{') && s.endsWith('}');
  })) {
    try {
      lines.forEach((line) => JSON.parse(line));
      return 'jsonl';
    } catch {
      // fall through to CSV
    }
  }

  // Default to CSV
  return 'csv';
}

// ---------------------------------------------------------------------------
// Row validation helpers
// ---------------------------------------------------------------------------

function normalizeJsonValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

// ---------------------------------------------------------------------------
// JSON / JSONL parsing
// ---------------------------------------------------------------------------

export function parseJsonObjects(items: unknown[]): { rows: ParsedRow[]; headers: string[] } {
  const rows: ParsedRow[] = [];
  const headerSet = new Set<string>();
  const grammarKeys = [
    'article', 'singularDefinite', 'pluralIndefinite', 'pluralDefinite',
    'present', 'past', 'perfect',
    'neuter', 'definite', 'plural', 'comparative', 'superlative',
  ] as const;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const rawObject = item as Record<string, unknown>;
    const errors: string[] = [];
    const warnings: string[] = [];
    const fields: Partial<Record<KnownColumn, string>> = {};
    const grammarFields: Record<string, string> = {};
    const translationFields: Record<string, string> = {};

    for (const key of Object.keys(rawObject)) {
      // Native nested translations object
      if (
        key === 'translations' &&
        rawObject[key] &&
        typeof rawObject[key] === 'object' &&
        !Array.isArray(rawObject[key])
      ) {
        const t2 = rawObject[key] as Record<string, unknown>;
        for (const code of Object.keys(t2)) {
          if (/^[a-z]{2,3}$/i.test(code)) {
            const v = normalizeJsonValue(t2[code]);
            if (v) {
              translationFields[code.toLowerCase()] = v;
              headerSet.add(`translations.${code.toLowerCase()}`);
            }
          }
        }
        continue;
      }

      const normalizedKey = normalizeHeader(key);
      if (!normalizedKey) continue;

      if (typeof normalizedKey === 'string' && normalizedKey.startsWith('translations.')) {
        const code = normalizedKey.slice('translations.'.length);
        const v = normalizeJsonValue(rawObject[key]);
        if (v) translationFields[code] = v;
        headerSet.add(normalizedKey);
        continue;
      }

      fields[normalizedKey as KnownColumn] = normalizeJsonValue(rawObject[key]);
      headerSet.add(normalizedKey);
    }

    if (rawObject.grammar && typeof rawObject.grammar === 'object') {
      const grammarRaw = rawObject.grammar as Record<string, unknown>;
      for (const grammarKey of grammarKeys) {
        if (grammarKey in grammarRaw) {
          grammarFields[grammarKey] = normalizeJsonValue(grammarRaw[grammarKey]);
          headerSet.add(grammarKey);
        }
      }
    }

    const danish = fields.danish ?? '';
    const english = fields.english ?? '';

    if (!danish && !english) {
      errors.push(t('bulkImport.rowValidationError'));
    }

    const rawType = fields.type ?? '';
    const type: EntryType = rawType
      ? normalizeEntryType(rawType.toLowerCase())
      : 'word';

    if (rawType && !ENTRY_TYPES.includes(type)) {
      warnings.push(t('bulkImport.unknownType', { type: rawType }));
    }

    const entry: LexisEntryInput = {
      danish,
      english,
      notes: fields.notes ?? '',
      type,
      ...(Object.keys(translationFields).length > 0 ? { translations: translationFields } : {}),
      ...(Object.keys(grammarFields).length > 0 ? { grammar: grammarFields } : {}),
    };

    rows.push({
      rowIndex: i + 1,
      raw: [],
      entry: errors.length === 0 ? entry : null,
      errors,
      warnings,
    });
  }

  return { rows, headers: Array.from(headerSet) };
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

export function parseRows(text: string): { rows: ParsedRow[]; headers: string[] } {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '');

  if (lines.length === 0) return { rows: [], headers: [] };

  const delimiter = detectDelimiter(text);
  const headerRaw = splitLine(lines[0], delimiter);
  const headers = headerRaw.map((h) => h.replace(/^(["'])(.*)\1$/g, '$2').trim());

  type ColKey = KnownColumn | `translations.${string}`;
  const columnMap: (ColKey | null)[] = headers.map(normalizeHeader);

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = splitLine(lines[i], delimiter);
    const errors: string[] = [];
    const warnings: string[] = [];

    const fields: Partial<Record<KnownColumn, string>> = {};
    const translationFields: Record<string, string> = {};
    for (let c = 0; c < columnMap.length; c++) {
      const col = columnMap[c];
      if (!col) continue;
      const value = (raw[c] ?? '').trim();
      if (typeof col === 'string' && col.startsWith('translations.')) {
        if (value) translationFields[col.slice('translations.'.length)] = value;
      } else {
        fields[col as KnownColumn] = value;
      }
    }

    const danish = fields.danish ?? '';
    const english = fields.english ?? '';

    if (!danish && !english) {
      errors.push(t('bulkImport.rowValidationError'));
    }

    const rawType = fields.type ?? '';
    const type: EntryType = rawType
      ? normalizeEntryType(rawType.toLowerCase())
      : 'word';

    if (rawType && !ENTRY_TYPES.includes(type)) {
      warnings.push(t('bulkImport.unknownType', { type: rawType }));
    }

    const grammarFields: Record<string, string> = {};
    const grammarKeys = [
      'article', 'singularDefinite', 'pluralIndefinite', 'pluralDefinite',
      'present', 'past', 'perfect',
      'neuter', 'definite', 'plural', 'comparative', 'superlative',
    ] as const;
    for (const key of grammarKeys) {
      const v = fields[key as KnownColumn];
      if (v) grammarFields[key] = v;
    }

    const entry: LexisEntryInput = {
      danish,
      english,
      notes: fields.notes ?? '',
      type,
      ...(Object.keys(translationFields).length > 0 ? { translations: translationFields } : {}),
      ...(Object.keys(grammarFields).length > 0 ? { grammar: grammarFields } : {}),
    };

    rows.push({ rowIndex: i, raw, entry: errors.length === 0 ? entry : null, errors, warnings });
  }

  return { rows, headers };
}

// ---------------------------------------------------------------------------
// Main entry point: auto-detect format and parse
// ---------------------------------------------------------------------------

export function parseInput(text: string): { rows: ParsedRow[]; headers: string[]; format: DetectedFormat | null } {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], headers: [], format: null };

  if (trimmed[0] === '[' || trimmed[0] === '{') {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) {
        return { ...parseJsonObjects(json), format: 'json' };
      }
      if (json && typeof json === 'object') {
        const obj = json as Record<string, unknown>;
        if (Array.isArray(obj.entries)) {
          return { ...parseJsonObjects(obj.entries as unknown[]), format: 'json' };
        }
        return { ...parseJsonObjects([json]), format: 'json' };
      }
    } catch {
      // fall back to CSV parsing
    }
  }

  const lines = trimmed
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '');

  const isJsonl =
    lines.length > 0 &&
    lines.every((line) => {
      const s = line.trim();
      return s.startsWith('{') && s.endsWith('}');
    });

  if (isJsonl) {
    try {
      const items = lines.map((line) => JSON.parse(line));
      return { ...parseJsonObjects(items), format: 'jsonl' };
    } catch {
      // fall back to CSV parsing
    }
  }

  return { ...parseRows(text), format: 'csv' };
}
