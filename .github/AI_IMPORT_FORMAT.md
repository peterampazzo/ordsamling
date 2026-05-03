# AI Import Format Reference

This file documents the supported import formats and data structure used by the bulk import feature.
It can be used to enrich AI prompts or developer documentation.

## Supported Input Formats

- CSV
- TSV
- JSON
- JSONL

## Field Mapping

The import parser supports these top-level fields:

- `danish` — Danish headword
- `english` — English translation
- `type` — One of `word`, `noun`, `verb`, `adjective`, `expression`
- `notes` — Optional notes, grammar hints, examples, usage
- `translations` — Optional object of extra translations keyed by ISO 639-1 code (e.g. `fr`, `de`, `es`)
- `grammar` — Optional nested object containing type-specific grammar forms

### Grammar object keys

For entry types that support grammar details, the `grammar` object may include:

- `article`
- `singularDefinite`
- `pluralIndefinite`
- `pluralDefinite`
- `present`
- `past`
- `perfect`
- `neuter`
- `definite`
- `plural`
- `comparative`
- `superlative`

## Example CSV/TSV

```csv
danish,english,type,notes
hus,house,noun,
gå,to go,verb,
stor,big,adjective,
god morgen,good morning,expression,Hilsen om morgenen
```

## Example JSON Array

```json
[
  {
    "danish": "hus",
    "english": "house",
    "type": "noun",
    "notes": "En almindelig bolig",
    "translations": { "fr": "maison", "de": "Haus" },
    "grammar": {
      "article": "et",
      "singularDefinite": "huset",
      "pluralIndefinite": "huse",
      "pluralDefinite": "husene"
    }
  },
  {
    "danish": "spise",
    "english": "to eat",
    "type": "verb",
    "grammar": {
      "present": "spiser",
      "past": "spiste",
      "perfect": "har spist"
    }
  },
  {
    "danish": "stor",
    "english": "big",
    "type": "adjective",
    "grammar": {
      "neuter": "stort",
      "definite": "store",
      "plural": "store",
      "comparative": "større",
      "superlative": "størst"
    }
  },
  {
    "danish": "godmorgen",
    "english": "good morning",
    "type": "expression",
    "notes": "Hilsen om morgenen"
  }
]
```

## Example JSONL

```jsonl
{"danish":"hus","english":"house","type":"noun","translations":{"fr":"maison"},"grammar":{"article":"et","singularDefinite":"huset","pluralIndefinite":"huse","pluralDefinite":"husene"}}
{"danish":"spise","english":"to eat","type":"verb","grammar":{"present":"spiser","past":"spiste","perfect":"har spist"}}
{"danish":"stor","english":"big","type":"adjective","grammar":{"neuter":"stort","definite":"store","plural":"store","comparative":"større","superlative":"størst"}}
{"danish":"godmorgen","english":"good morning","type":"expression","notes":"Hilsen om morgenen"}
```

## AI Document Processing Response

The document processing endpoint accepts a `languages` form field (comma-separated ISO 639-1
codes, derived from the user's enabled extra languages in local settings) and returns JSON of
the form:

```json
{
  "entries": [
    {
      "danish": "hus",
      "english": "house",
      "type": "noun",
      "notes": "Et almindeligt dansk substantiv",
      "translations": { "fr": "maison", "de": "Haus" },
      "grammar": {
        "article": "et",
        "singularDefinite": "huset",
        "pluralIndefinite": "huse",
        "pluralDefinite": "husene"
      }
    }
  ],
  "totalExtracted": 42,
  "newWords": 12,
  "processed": 10,
  "languages": ["fr", "de"],
  "message": "..."
}
```

## Notes for AI prompt authors

- If the AI returns a `type` not one of the supported values, default to `word`.
- Use the `grammar` object only when the type has grammar-specific fields.
- For expressions, `grammar` is usually omitted.
- The `translations` object only includes the languages the user has enabled — do not invent extra ones.
- The parser accepts both CSV/TSV with a header row, and JSON/JSONL objects.
- This file should be kept in sync with `src/lib/lexicon.ts` and `src/pages/BulkImport.tsx`.
