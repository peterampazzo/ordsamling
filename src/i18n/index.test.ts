/**
 * Bug Condition Exploration Test for Locale Detection
 * 
 * Property 1: Bug Condition - Locale Detection Failure
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples that demonstrate the locale detection bug exists.
 * 
 * Bug Condition 2 (from design):
 * - App initializes with no stored language in localStorage
 * - Device locale is set to a supported language (e.g., "en-US")
 * - detectInitialLang returns "da" instead of "en"
 * - navigator.language and navigator.languages are ignored
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to test the module initialization, so we'll need to dynamically import
// and mock navigator before the module loads

describe('Bug Condition Exploration: Locale Detection Failure', () => {
  let originalNavigator: Navigator;

  beforeEach(() => {
    // Save original navigator
    originalNavigator = global.navigator;
    
    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    
    // Clear module cache to allow re-initialization
    vi.resetModules();
  });

  it('Bug Condition 2.1: English device locale ignored, returns "da" instead of "en"', async () => {
    // Mock navigator.language to English
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        language: 'en-US',
        languages: ['en-US', 'en'],
      },
      writable: true,
      configurable: true,
    });

    // Clear localStorage to ensure no stored preference
    localStorage.removeItem('ordsamling-lang');

    // Dynamically import the module to trigger detectInitialLang
    const { getLang } = await import('./index');

    // EXPECTED TO FAIL ON UNFIXED CODE:
    // Should return "en" based on device locale, but returns "da"
    expect(getLang()).toBe('en');
  });

  it('Bug Condition 2.2: Unsupported locale (Swedish) should fallback to "en", not "da"', async () => {
    // Mock navigator.language to Swedish (not in AVAILABLE_LANGS)
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        language: 'sv-SE',
        languages: ['sv-SE', 'sv'],
      },
      writable: true,
      configurable: true,
    });

    localStorage.removeItem('ordsamling-lang');

    const { getLang } = await import('./index');

    // EXPECTED TO FAIL ON UNFIXED CODE:
    // Should fallback to "en" for unsupported locale, but returns "da"
    expect(getLang()).toBe('en');
  });

  it('Bug Condition 2.3: navigator.languages array ignored when localStorage empty', async () => {
    // Mock navigator with languages array where second item is supported
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        language: 'sv-SE', // Unsupported
        languages: ['sv-SE', 'en-GB', 'da-DK'], // Second is English
      },
      writable: true,
      configurable: true,
    });

    localStorage.removeItem('ordsamling-lang');

    const { getLang } = await import('./index');

    // EXPECTED TO FAIL ON UNFIXED CODE:
    // Should check languages array and find "en", but returns "da"
    expect(getLang()).toBe('en');
  });

  it('Bug Condition 2.4: Danish device locale should work correctly', async () => {
    // This should work even on unfixed code (Danish is the default)
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        language: 'da-DK',
        languages: ['da-DK', 'da'],
      },
      writable: true,
      configurable: true,
    });

    localStorage.removeItem('ordsamling-lang');

    const { getLang } = await import('./index');

    // This might pass on unfixed code by accident (da is the default)
    // But after fix, it should pass because device locale is detected
    expect(getLang()).toBe('da');
  });

  it('Bug Condition 2.5: Locale code extraction from various formats', async () => {
    // Test that "en-US", "en-GB", "en" all extract to "en"
    const testCases = [
      { locale: 'en-US', expected: 'en' },
      { locale: 'en-GB', expected: 'en' },
      { locale: 'en', expected: 'en' },
      { locale: 'da-DK', expected: 'da' },
      { locale: 'da', expected: 'da' },
    ];

    for (const { locale, expected } of testCases) {
      vi.resetModules();
      localStorage.clear();

      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          language: locale,
          languages: [locale],
        },
        writable: true,
        configurable: true,
      });

      const { getLang } = await import('./index');

      // EXPECTED TO FAIL ON UNFIXED CODE for en-* locales:
      // Should extract language code and return it, but returns "da"
      expect(getLang()).toBe(expected);
    }
  });
});

describe('Preservation: Explicit Language Selection Priority', () => {
  let originalNavigator: Navigator;

  beforeEach(() => {
    originalNavigator = global.navigator;
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.resetModules();
  });

  it('Preservation 3.1: Stored language preference overrides device locale', async () => {
    // Set device to English
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        language: 'en-US',
        languages: ['en-US'],
      },
      writable: true,
      configurable: true,
    });

    // But user explicitly chose Danish
    localStorage.setItem('ordsamling-lang', 'da');

    const { getLang } = await import('./index');

    // EXPECTED TO PASS ON UNFIXED CODE:
    // Stored preference should always win (this is correct behavior to preserve)
    expect(getLang()).toBe('da');
  });

  it('Preservation 3.1: Stored English overrides Danish device locale', async () => {
    // Set device to Danish
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        language: 'da-DK',
        languages: ['da-DK'],
      },
      writable: true,
      configurable: true,
    });

    // But user explicitly chose English
    localStorage.setItem('ordsamling-lang', 'en');

    const { getLang } = await import('./index');

    // EXPECTED TO PASS ON UNFIXED CODE:
    // Stored preference should always win
    expect(getLang()).toBe('en');
  });
});
