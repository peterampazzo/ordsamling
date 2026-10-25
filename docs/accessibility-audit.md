# Accessibility Audit

## Overview

This document records the accessibility audit history for the **ordsamling** application, tracking tool versions, audit dates, and the status of any known issues discovered during implementation.

The app targets **WCAG 2.2 Level AA** compliance and forward-compatibility with **WCAG 3.0 (Working Draft)**.

---

## Audit History

| Date | axe-core | @axe-core/playwright | apca-w3 | Notes |
|------|----------|----------------------|---------|-------|
| 2025-07-28 | 4.11.4 | 4.11.3 | N/A (inline impl) | Initial audit — all issues resolved |

> **Note on apca-w3:** The `apca-w3` npm package is not installed. APCA Lc values are computed via an inline implementation in `src/test/contrast-utils.ts` based on the [SAPC-APCA reference algorithm](https://github.com/Myndex/SAPC-APCA).

---

## Known Issues

All issues listed below were discovered during the WCAG 3 accessibility implementation and have been resolved.

| # | WCAG Criterion | Description | Component | Status |
|---|----------------|-------------|-----------|--------|
| 1 | 1.3.1 Info and Relationships / 4.1.2 Name, Role, Value | English input and notes textarea were missing `aria-label` attributes | `AddEntryForm` | ✅ Fixed (task 11.3) |
| 2 | 1.3.1 Info and Relationships / 4.1.2 Name, Role, Value | Grammar field inputs used `<span>` instead of `<label>`, breaking the label association | `EntryGrammar` | ✅ Fixed (task 11.3) |
| 3 | 1.3.1 Info and Relationships / 4.1.2 Name, Role, Value | Paste textarea missing `htmlFor`/`id` pairing; file input missing `aria-label` | `StructuredImportSection` | ✅ Fixed (task 11.3) |
| 4 | 4.1.2 Name, Role, Value | Answer input missing `aria-label` | `Quiz.tsx` | ✅ Fixed (task 11.3) |

---

## Tool Versions Reference

Versions are sourced from `package.json` devDependencies at the time of the last audit.

| Package | Version |
|---------|---------|
| `axe-core` | 4.11.4 |
| `@axe-core/playwright` | 4.11.3 |
| `@playwright/test` | 1.57.0 |
| `vitest-axe` | 0.1.0 |
| `vitest` | 3.2.4 |

---

## Remediation Notes

- All four issues above were identified via the automated form-label tests in `src/test/form-labels.test.tsx` and axe-core component tests in `src/test/axe-components.test.tsx`.
- No open issues remain as of the last audit date.
- Future audits should re-run `pnpm test` and the Playwright E2E suite (`playwright/accessibility.spec.ts`) to confirm continued compliance.
