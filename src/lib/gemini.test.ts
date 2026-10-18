import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autocompleteVerbForms, autocompleteSingleWord, fetchDistractors, processDocument,
  processDocumentDirect, retryFailedChunks, GeminiKeyInvalidError,
  ProcessingCancelledError, validateGeminiKey,
} from './gemini';
import { setAiConfig } from './storageConfig';

const forms = { present: 'går', past: 'gik', perfect: 'har gået' };
const word = { danish: 'hus', english: 'house', type: 'noun', notes: '' };
const response = (text: string, finishReason = 'STOP') => new Response(JSON.stringify({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
}));

beforeEach(() => {
  localStorage.clear();
  setAiConfig({ geminiApiKey: 'test-key', geminiModel: 'gemini-2.5-flash' });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Gemini REST generation', () => {
  it('calls Google directly with the key in a header and REST system instruction/config', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify(forms)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(autocompleteVerbForms('gå')).resolves.toEqual(forms);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(url).not.toContain('test-key');
    expect(options.headers['x-goog-api-key']).toBe('test-key');
    expect(JSON.parse(options.body)).toMatchObject({
      generationConfig: { temperature: 0.1 },
      contents: [{ role: 'user', parts: [{ text: expect.stringContaining('gå') }] }],
      systemInstruction: { parts: [{ text: expect.stringContaining('JSON') }] },
    });
  });

  it('ignores thought parts and combines only final answer text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [
        { thought: true, text: 'Unrelated reasoning, not JSON' },
        { text: '{"present":"går",' }, { text: '"past":"gik","perfect":"har gået"}' },
      ] } }],
    }))));
    await expect(autocompleteVerbForms('gå')).resolves.toEqual(forms);
  });

  it.each([
    JSON.stringify([word]),
    `\`\`\`json\n${JSON.stringify([word])}\n\`\`\``,
    `Here are the words:\n${JSON.stringify([word])}\nDone.`,
  ])('parses real direct-import responses: %s', async text => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(text)));
    const result = await processDocumentDirect('hus', [], []);
    expect(result.entries).toEqual([word]);
    expect(result.error).toBeUndefined();
  });

  it('returns an actionable direct-import error for malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('not a vocabulary list')));
    const result = await processDocumentDirect('hus', [], []);
    expect(result.entries).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('supports single-word enrichment and quiz distractors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(word)))
      .mockResolvedValueOnce(response('["cat","bird","fish"]')));
    await expect(autocompleteSingleWord('hus')).resolves.toMatchObject(word);
    await expect(fetchDistractors({
      correctAnswer: 'dog', questionType: 'translate', entryType: 'noun',
      difficulty: 'beginner', scoreRatio: 0, prompt: 'hund', answerLang: 'english',
    })).resolves.toEqual(['cat', 'bird', 'fish']);
  });

  it('maps invalid API keys from structured error details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { details: [{ reason: 'API_KEY_INVALID' }] },
    }), { status: 400 })));
    await expect(autocompleteVerbForms('gå')).rejects.toBeInstanceOf(GeminiKeyInvalidError);
  });

  it('reports retry delay and daily quota from structured 429 details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { details: [{ retryDelay: '12.5s' }, { violations: [{ quotaId: 'RequestsPerDay' }] }] },
    }), { status: 429 })));
    await expect(autocompleteVerbForms('gå')).rejects.toMatchObject({
      retryAfterSeconds: 13, isDailyQuota: true,
    });
  });

  it('rejects blocked and empty output instead of returning reasoning as content', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })))
      .mockResolvedValueOnce(response('')));
    await expect(autocompleteVerbForms('gå')).rejects.toThrow('usable content');
    await expect(autocompleteVerbForms('gå')).rejects.toThrow('no text');
  });

  it('marks truncated direct output even when the returned partial array is valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(JSON.stringify([word]), 'MAX_TOKENS')));
    const result = await processDocumentDirect('hus', [], []);
    expect(result.entries).toEqual([word]);
    expect(result.truncated).toBe(true);
  });

  it('cancels the in-flight request without converting cancellation into a chunk failure', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
    vi.stubGlobal('fetch', fetchMock);
    const processing = processDocument('hus', [], [], { signal: controller.signal });
    controller.abort();
    await expect(processing).rejects.toBeInstanceOf(ProcessingCancelledError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains successful chunks and retries only the failed chunk', async () => {
    const words = Array.from({ length: 51 }, (_, i) => `ord${i}`);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(words)))
      .mockResolvedValueOnce(response(JSON.stringify([word])))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(response(JSON.stringify([{ ...word, danish: 'kat' }])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await processDocument('Danish words', [], []);
    expect(result.entries).toHaveLength(1);
    expect(result.failedChunks).toHaveLength(1);
    const retried = await retryFailedChunks(result.failedChunks!, []);
    expect(retried.entries[0].danish).toBe('kat');
    expect(retried.failedChunks).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('checks keys using a real generation response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('OK')));
    await expect(validateGeminiKey()).resolves.toBe('valid');
  });

  it('does not claim that key validation succeeded when the network is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
    await expect(validateGeminiKey()).rejects.toThrow('Offline');
  });
});
