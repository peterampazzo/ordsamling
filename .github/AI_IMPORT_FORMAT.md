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
- `italian` — Italian translation
- `type` — One of `word`, `noun`, `verb`, `adjective`, `expression`
- `notes` — Optional notes, grammar hints, examples, usage
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
danish,english,italian,type,notes
hus,house,casa,noun,
gå,to go,andare,verb,
stor,big,grande,adjective,
god morgen,good morning,buongiorno,expression,Hilsen om morgenen
```

## Example JSON Array

```json
[
  {
    "danish": "hus",
    "english": "house",
    "italian": "casa",
    "type": "noun",
    "notes": "En almindelig bolig",
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
    "italian": "mangiare",
    "type": "verb",
    "notes": "Uregelmæssig verbum",
    "grammar": {
      "present": "spiser",
      "past": "spiste",
      "perfect": "har spist"
    }
  },
  {
    "danish": "stor",
    "english": "big",
    "italian": "grande",
    "type": "adjective",
    "notes": "Adjektiv for størrelse",
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
    "italian": "buongiorno",
    "type": "expression",
    "notes": "Hilsen om morgenen"
  }
]
```

## Example JSONL

```jsonl
{"danish":"hus","english":"house","italian":"casa","type":"noun","grammar":{"article":"et","singularDefinite":"huset","pluralIndefinite":"huse","pluralDefinite":"husene"}}
{"danish":"spise","english":"to eat","italian":"mangiare","type":"verb","grammar":{"present":"spiser","past":"spiste","perfect":"har spist"}}
{"danish":"stor","english":"big","italian":"grande","type":"adjective","grammar":{"neuter":"stort","definite":"store","plural":"store","comparative":"større","superlative":"størst"}}
{"danish":"godmorgen","english":"good morning","italian":"buongiorno","type":"expression","notes":"Hilsen om morgenen"}
```

## AI Document Processing Response

The document processing endpoint returns JSON of the form:

```json
{
  "entries": [
    {
      "danish": "hus",
      "english": "house",
      "italian": "casa",
      "type": "noun",
      "notes": "Et almindeligt dansk substantiv",
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
  "message": "..."
}
```

## Notes for AI prompt authors

- If the AI returns a `type` not one of the supported values, default to `word`.
- Use the `grammar` object only when the type has grammar-specific fields.
- For expressions, `grammar` is usually omitted.
- The parser accepts both CSV/TSV with a header row, and JSON/JSONL objects.
- This file should be kept in sync with `src/lib/lexicon.ts` and `src/pages/BulkImport.tsx`.
