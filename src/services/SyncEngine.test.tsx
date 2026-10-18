import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSheetsContext } from '@/lib/syncContext';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import { createSyncFixture, entry, scope, session } from '@/test/syncFixture';
import { enqueue, readQueue, readArray, readBaseline, DATA_OWNER_KEY } from '@/lib/syncQueue';
import { REAL_STORAGE_KEY } from '@/lib/demo';
import { saveSession } from '@/lib/quizHistory';
import { SyncEngine } from './SyncEngine';

describe('SyncEngine', () => {
  let fixture: ReturnType<typeof createSyncFixture>;
  beforeEach(() => { fixture = createSyncFixture(); });
  afterEach(() => fixture.dispose());

  it('persists intent immediately and recovers it after stopping before debounce', async () => {
    await fixture.engine.pushEntry(entry(), 'add');
    expect(readQueue(scope)).toHaveLength(1);
    expect(fixture.write).not.toHaveBeenCalled();
    fixture.stop();
    localStorage.setItem(REAL_STORAGE_KEY, '[]');
    const next = new SyncEngine(fixture.sheets);
    next.setEnabled(true);
    await next.syncNow();
    expect(readArray(REAL_STORAGE_KEY)).toEqual([entry()]);
    expect(readQueue(scope)).toEqual([]);
  });

  it('shares status and one in-flight sync between hook consumers', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <GoogleSheetsContext.Provider value={fixture.engine}>{children}</GoogleSheetsContext.Provider>;
    const hooks = renderHook(() => [useGoogleSheets(), useGoogleSheets()], { wrapper });
    await act(async () => {
      await hooks.result.current[0].pushEntry(entry(), 'add');
    });
    expect(hooks.result.current[0].syncState).toBe(hooks.result.current[1].syncState);
    expect(hooks.result.current[1].syncState.pendingCount).toBe(1);
    await act(async () => {
      await Promise.all([fixture.engine.syncNow(), fixture.engine.syncNow()]);
    });
    expect(fixture.write).toHaveBeenCalledTimes(1);
    expect(fixture.read).toHaveBeenCalledTimes(1);
    hooks.unmount();
  });

  it('keeps an edit arriving during an earlier write and rebases it for the next flush', async () => {
    const first = entry();
    await fixture.engine.pushEntry(first, 'add');
    let release!: () => void;
    let started!: () => void;
    const writing = new Promise<void>(resolve => { started = resolve; });
    fixture.write.mockImplementationOnce(async () => {
      started();
      await new Promise<void>(resolve => { release = resolve; });
      fixture.setRemote([first]);
    });
    const flush = fixture.engine.syncNow();
    await writing;
    const second = { ...first, danish: 'kat', updatedAt: 2000 };
    await fixture.engine.pushEntry(second, 'update');
    release();
    await flush;
    expect(readQueue(scope)).toHaveLength(1);
    expect(readArray(REAL_STORAGE_KEY)).toEqual([second]);
    await fixture.engine.syncNow();
    expect(fixture.getRemote()).toEqual([second]);
    expect(readQueue(scope)).toEqual([]);
  });

  it('keeps pending deletions deleted and sends the real delete', async () => {
    fixture.setRemote([entry()]);
    await fixture.engine.syncNow();
    await fixture.engine.pushEntry(entry(), 'delete');
    expect(readArray(REAL_STORAGE_KEY)).toEqual([]);
    await fixture.engine.syncNow();
    expect(fixture.getRemote()).toEqual([]);
    expect(readArray(REAL_STORAGE_KEY)).toEqual([]);
    expect(readQueue(scope)).toEqual([]);
  });

  it('preserves both versions of a conflict until explicitly resolved', async () => {
    fixture.setRemote([entry()]);
    await fixture.engine.syncNow();
    const local = entry('entry', 'lokal');
    await fixture.engine.pushEntry(local, 'update');
    fixture.setRemote([entry('entry', 'remote')]);
    await fixture.engine.syncNow();
    expect(fixture.engine.getSnapshot().status).toBe('conflict');
    expect(readArray(REAL_STORAGE_KEY)).toEqual([local]);
    expect(fixture.write).not.toHaveBeenCalled();
    await fixture.engine.resolveConflict('entry', 'local');
    await fixture.engine.syncNow();
    expect(fixture.getRemote()).toEqual([local]);
    expect(readQueue(scope)).toEqual([]);
  });

  it('does not discard a newer local edit when resolving an earlier conflict remotely', async () => {
    fixture.setRemote([entry()]);
    await fixture.engine.syncNow();
    await fixture.engine.pushEntry(entry('entry', 'local'), 'update');
    fixture.setRemote([entry('entry', 'remote')]);
    await fixture.engine.syncNow();
    const latest = entry('entry', 'latest');
    await fixture.engine.pushEntry(latest, 'update');
    await fixture.engine.resolveConflict('entry', 'remote');
    expect(readArray(REAL_STORAGE_KEY)).toEqual([latest]);
    expect(readQueue(scope)).toHaveLength(1);
  });

  it('records quiz and streak operations without mounting Index', async () => {
    await saveSession(session());
    expect(readQueue(scope).map(op => op.type)).toEqual(['quiz_history', 'streak_event']);
    await fixture.engine.syncNow();
    expect(fixture.appendQuiz).toHaveBeenCalledTimes(1);
    expect(fixture.appendStreak).toHaveBeenCalledTimes(1);
    expect(readQueue(scope)).toEqual([]);
  });

  it('recovers legacy pending operations without inventing a deletion baseline', async () => {
    localStorage.setItem('ordsamling-dirty-queue', JSON.stringify([
      { id: 'legacy', type: 'lexicon', operation: 'delete', payload: 'entry', timestamp: 1 },
    ]));
    fixture.setRemote([entry()]);
    await fixture.engine.syncNow();
    expect(readArray(REAL_STORAGE_KEY)).toEqual([]);
    expect(fixture.engine.getSnapshot().conflicts).toHaveLength(1);
    expect(readQueue(scope)[0].id).toBe('legacy');
  });

  it('does not remove never-synced local rows just because they are missing remotely', async () => {
    localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify([entry()]));
    await fixture.engine.syncNow();
    expect(readArray(REAL_STORAGE_KEY)).toEqual([entry()]);
  });

  it('preserves an older unjournaled local edit from before the engine upgrade', async () => {
    const local = entry('entry', 'local');
    localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify([local]));
    fixture.setRemote([entry('entry', 'remote')]);
    await fixture.engine.syncNow();
    expect(readArray(REAL_STORAGE_KEY)).toEqual([local]);
    expect(readQueue(scope)).toHaveLength(1);
    expect(fixture.engine.getSnapshot().status).toBe('conflict');
  });

  it('allows startup to establish the same owner while a local edit is waiting for the lock', async () => {
    const saving = fixture.engine.pushEntry(entry(), 'add');
    localStorage.setItem(DATA_OWNER_KEY, JSON.stringify(scope));
    await saving;
    expect(readArray(REAL_STORAGE_KEY)).toEqual([entry()]);
  });

  it('recognizes remote deletions only for previously acknowledged entries', async () => {
    fixture.setRemote([entry()]);
    await fixture.engine.syncNow();
    fixture.setRemote([]);
    await fixture.engine.syncNow();
    expect(readArray(REAL_STORAGE_KEY)).toEqual([]);
  });

  it('does not pull or push in demo/disabled mode', async () => {
    fixture.engine.setEnabled(false);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fixture.read).not.toHaveBeenCalled();
    expect(await fixture.engine.syncNow()).toEqual({ ok: false, reason: 'disabled' });
  });

  it('retains the journal when a response is lost and reconciles the committed row on retry', async () => {
    await fixture.engine.pushEntry(entry(), 'add');
    fixture.write.mockImplementationOnce(async () => {
      fixture.setRemote([entry()]);
      throw new TypeError('Network response lost');
    });
    await fixture.engine.syncNow();
    expect(readQueue(scope)).toHaveLength(1);
    await fixture.engine.syncNow();
    expect(fixture.write).toHaveBeenCalledTimes(1);
    expect(readQueue(scope)).toEqual([]);
  });

  it('blocks syncing an account-scoped journal with a different local owner', async () => {
    localStorage.setItem(DATA_OWNER_KEY, JSON.stringify({ ...scope, email: 'other@example.com' }));
    await fixture.engine.syncNow();
    expect(fixture.read).not.toHaveBeenCalled();
    expect(fixture.engine.getSnapshot().status).toBe('error');
  });

  it('retains edits and reports a limitation when browser locks are unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    await fixture.engine.pushEntry(entry(), 'add');
    await fixture.engine.syncNow();
    expect(readQueue(scope)).toHaveLength(1);
    expect(fixture.engine.getSnapshot().errorMessage).toContain('tab locking');
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it('reports quota errors instead of claiming that an unjournaled edit was saved', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    await expect(fixture.engine.pushEntry(entry(), 'add')).rejects.toThrow();
    expect(fixture.engine.getSnapshot().status).toBe('error');
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it('retains corrupt queue data and does not send any writes', async () => {
    localStorage.setItem('ordsamling-dirty-queue', '{broken');
    await fixture.engine.syncNow();
    expect(localStorage.getItem('ordsamling-dirty-queue')).toBe('{broken');
    expect(fixture.engine.getSnapshot().status).toBe('error');
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it('groups thirty additions into one bounded write batch', async () => {
    for (let i = 0; i < 30; i++) await fixture.engine.pushEntry(entry(String(i)), 'add');
    await fixture.engine.syncNow();
    expect(fixture.read).toHaveBeenCalledTimes(1);
    expect(fixture.write).toHaveBeenCalledTimes(1);
    expect(fixture.getRemote()).toHaveLength(30);
  });

  it('replays an intent persisted before its local snapshot', async () => {
    enqueue(scope, { type: 'lexicon', operation: 'add', payload: entry(), baseline: null });
    await fixture.engine.syncNow();
    expect(readArray(REAL_STORAGE_KEY)).toEqual([entry()]);
    expect(readBaseline(scope).entries.entry).toEqual(entry());
  });

  it('does not accept a late remote response after disconnect', async () => {
    let release!: () => void;
    let started!: () => void;
    const reading = new Promise<void>(resolve => { started = resolve; });
    fixture.read.mockImplementationOnce(async () => {
      started();
      await new Promise<void>(resolve => { release = resolve; });
      return { entries: [entry()], rows: [] };
    });
    const flush = fixture.engine.syncNow();
    await reading;
    await fixture.engine.disconnect();
    release();
    await flush;
    expect(readArray(REAL_STORAGE_KEY)).toEqual([]);
    expect(fixture.engine.getSnapshot().status).toBe('disconnected');
  });
});
