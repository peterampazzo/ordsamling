import type { LexisEntry } from '@/lib/lexicon';
import type { QuizSessionRecord } from '@/lib/quizHistory';
import {
  registerPushQuizSession, registerPushStreakEvent, unregisterPushQuizSession, unregisterPushStreakEvent,
} from '@/lib/quizHistory';
import { REAL_STORAGE_KEY } from '@/lib/demo';
import { getStorageConfig, setStorageConfig } from '@/lib/storageConfig';
import { getValidAccessToken, getStoredEmail, initiateOAuthFlow, clearStoredTokens, revokeOAuthToken } from '@/lib/googleOAuth';
import type { SheetSettings, StreakEvent } from '@/lib/sheetTypes';
import { setExtraLanguages, registerLanguagePersistence } from '@/lib/settings';
import { snapshotLocalData } from '@/lib/backup';
import { sameContent } from '@/lib/syncMerge';
import {
  acknowledge, DATA_OWNER_KEY, enqueue, HISTORY_KEY, migrateLegacyQueue,
  readArray, readBaseline, readJson, readQueue, replaceOperation,
  scopeId, withStorageLock, writeBaseline,
  type QueuedOperation, type SyncScope,
} from '@/lib/syncQueue';
import { GoogleSheetsService, type LexiconChange } from './GoogleSheetsService';

export interface SyncConflict {
  id: string;
  operationIds: string[];
  local: LexisEntry | SheetSettings | null;
  remote: LexisEntry | SheetSettings | null;
  type: 'lexicon' | 'settings';
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'dirty' | 'error' | 'conflict' | 'disconnected';
  lastSyncAt: number | null;
  spreadsheetId: string | null;
  connectedEmail: string | null;
  errorMessage: string | null;
  pendingCount: number;
  sessionExpired: boolean;
  conflicts: SyncConflict[];
}

export type PullResult =
  | { ok: true; added: number; updated: number; removed: number }
  | { ok: false; reason: 'disabled' | 'no_spreadsheet' | 'session_expired' | 'conflict' | 'error' };

function entryId(operation: QueuedOperation): string {
  return typeof operation.payload === 'string' ? operation.payload : (operation.payload as LexisEntry).id;
}

function desiredEntry(operation: QueuedOperation): LexisEntry | null {
  return operation.operation === 'delete' ? null : operation.payload as LexisEntry;
}

function settingsEqual(a: SheetSettings | null | undefined, b: SheetSettings | null | undefined): boolean {
  return JSON.stringify(a?.extraLanguages ?? null) === JSON.stringify(b?.extraLanguages ?? null);
}

export class SyncEngine {
  private state: SyncState = {
    status: 'disconnected', lastSyncAt: null, spreadsheetId: null, connectedEmail: null,
    errorMessage: null, pendingCount: 0, sessionExpired: false, conflicts: [],
  };
  private listeners = new Set<() => void>();
  private enabled = false;
  private started = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<PullResult> | null = null;
  private suppressSettings = false;
  private rerun = false;

  constructor(private readonly sheets = new GoogleSheetsService()) {}

  getSnapshot = (): SyncState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(update: Partial<SyncState>): void {
    this.state = { ...this.state, ...update };
    this.listeners.forEach(listener => listener());
  }

  private scope(): SyncScope | null {
    const config = getStorageConfig();
    return config.storageSource === 'google_sheets' && config.spreadsheetId && config.connectedEmail
      ? { spreadsheetId: config.spreadsheetId, email: config.connectedEmail } : null;
  }

  private assertOwner(scope: SyncScope): void {
    const owner = readJson<SyncScope | null>(DATA_OWNER_KEY, null);
    if (owner && scopeId(owner) !== scopeId(scope)) {
      throw new Error('Local data belongs to another account. Reconnect before syncing it.');
    }
    if (!owner) localStorage.setItem(DATA_OWNER_KEY, JSON.stringify(scope));
  }

  private refreshState(scope = this.scope()): void {
    const pendingCount = scope ? readQueue(scope).length : 0;
    this.publish({
      spreadsheetId: scope?.spreadsheetId ?? null, connectedEmail: scope?.email ?? null, pendingCount,
      status: !scope ? 'disconnected' : this.state.conflicts.length ? 'conflict' : pendingCount ? 'dirty' : 'idle',
    });
  }

  private fail(error: unknown): void {
    this.publish({ status: 'error', errorMessage: error instanceof Error ? error.message : 'Sync failed' });
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.generation++;
    if (!enabled) {
      clearTimeout(this.timer);
      this.publish({ status: 'disconnected' });
    } else if (this.started) this.schedule(0);
  }

  start(): () => void {
    if (this.started) return () => {};
    this.started = true;
    registerPushQuizSession(this.pushQuizSession);
    registerPushStreakEvent(this.pushStreakEvent);
    registerLanguagePersistence(codes => this.pushSettings({ extraLanguages: codes }));
    window.addEventListener('online', this.onResume);
    window.addEventListener('focus', this.onResume);
    document.addEventListener('visibilitychange', this.onResume);
    window.addEventListener('storage', this.onStorage);
    window.addEventListener('ordsamling:oauth-complete', this.onConnected);
    window.addEventListener('ordsamling:settings-dirty', this.onSettings);
    if (this.enabled) this.schedule(0);
    return () => {
      this.started = false;
      this.generation++;
      clearTimeout(this.timer);
      unregisterPushQuizSession();
      unregisterPushStreakEvent();
      registerLanguagePersistence(null);
      window.removeEventListener('online', this.onResume);
      window.removeEventListener('focus', this.onResume);
      document.removeEventListener('visibilitychange', this.onResume);
      window.removeEventListener('storage', this.onStorage);
      window.removeEventListener('ordsamling:oauth-complete', this.onConnected);
      window.removeEventListener('ordsamling:settings-dirty', this.onSettings);
    };
  }

  private onResume = (): void => {
    if (document.visibilityState === 'visible') this.schedule(100);
  };
  private onConnected = (): void => {
    this.generation++;
    snapshotLocalData('connect');
    this.publish({ conflicts: [], sessionExpired: false, errorMessage: null });
    this.schedule(0);
  };
  private onStorage = (event: StorageEvent): void => {
    if (!event.key || event.key.startsWith('ordsamling-') || event.key === REAL_STORAGE_KEY) {
      window.dispatchEvent(new CustomEvent('ordsamling:entries-synced'));
      window.dispatchEvent(new CustomEvent('ordsamling:quiz-recorded'));
      this.schedule(100);
    }
  };
  private onSettings = (event: Event): void => {
    if (this.suppressSettings || !this.enabled) return;
    const settings = (event as CustomEvent<SheetSettings>).detail;
    if (settings) void this.pushSettings(settings).catch(error => this.fail(error));
  };

  private schedule(delay = 1000): void {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.syncNow(); }, delay);
  }

  private applyQueue(scope: SyncScope): void {
    const entries = new Map(readArray<LexisEntry>(REAL_STORAGE_KEY).map(entry => [entry.id, entry]));
    const history = new Map(readArray<QuizSessionRecord>(HISTORY_KEY).map(session => [session.id, session]));
    for (const operation of readQueue(scope)) {
      if (operation.type === 'lexicon') {
        const entry = desiredEntry(operation);
        if (entry) entries.set(entry.id, entry);
        else entries.delete(entryId(operation));
      } else if (operation.type === 'quiz_history') {
        const session = operation.payload as QuizSessionRecord;
        history.set(session.id, session);
      } else if (operation.type === 'settings') this.applySettings(operation.payload as SheetSettings);
    }
    localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify([...entries.values()]));
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...history.values()].sort((a, b) => b.date - a.date).slice(0, 50)));
  }

  private applySettings(settings: SheetSettings): void {
    this.suppressSettings = true;
    try {
      setExtraLanguages(settings.extraLanguages, false);
    } finally {
      this.suppressSettings = false;
    }
  }

  pushEntry = async (entry: LexisEntry, operation: 'add' | 'update' | 'delete'): Promise<void> => {
    const ownerAtStart = localStorage.getItem(DATA_OWNER_KEY);
    const scopeAtStart = this.scope();
    try {
      await withStorageLock(() => {
        const owner = readJson<SyncScope | null>(DATA_OWNER_KEY, null);
        if (localStorage.getItem(DATA_OWNER_KEY) !== ownerAtStart &&
          (!scopeAtStart || !owner || scopeId(owner) !== scopeId(scopeAtStart))) {
          throw new Error('The local account changed. Retry this edit in the intended account.');
        }
        const entries = readArray<LexisEntry>(REAL_STORAGE_KEY);
        const previous = entries.find(item => item.id === entry.id);
        const scope = this.enabled ? this.scope() : null;
        if (scope) {
          this.assertOwner(scope);
          const baseline = readBaseline(scope).entries[entry.id];
          const earlier = readQueue(scope).find(item => item.type === 'lexicon' && entryId(item) === entry.id);
          enqueue(scope, {
            type: 'lexicon', operation, payload: operation === 'delete' ? entry.id : entry,
            baseline: earlier ? earlier.baseline : baseline ?? (operation === 'add' ? null : previous),
          });
        }
        const next = entries.filter(item => item.id !== entry.id);
        if (operation !== 'delete') next.unshift(entry);
        localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify(next));
        this.refreshState(scope);
      });
      window.dispatchEvent(new CustomEvent('ordsamling:entries-synced'));
      this.schedule();
    } catch (error) {
      this.fail(error);
      throw error;
    }
  };

  private async queue(input: Omit<QueuedOperation, 'scope' | 'id' | 'timestamp'>): Promise<void> {
    if (!this.enabled) return;
    const scope = this.scope();
    if (!scope) return;
    await withStorageLock(() => {
      if (!this.enabled || !this.scope() || scopeId(this.scope()!) !== scopeId(scope)) {
        throw new Error('The Google account changed before this operation could be saved.');
      }
      this.assertOwner(scope);
      enqueue(scope, input);
      this.refreshState(scope);
    });
    this.schedule();
  }

  pushQuizSession = (session: QuizSessionRecord): Promise<void> =>
    this.queue({ type: 'quiz_history', operation: 'add', payload: session });

  pushStreakEvent = (event: StreakEvent): Promise<void> =>
    this.queue({ type: 'streak_event', operation: 'add', payload: { ...event, id: event.id ?? crypto.randomUUID() } });

  pushSettings = async (settings: SheetSettings): Promise<void> => {
    const scopeAtStart = this.scope();
    try {
      await withStorageLock(() => {
        const currentScope = this.scope();
        if ((scopeAtStart || currentScope) &&
          (!scopeAtStart || !currentScope || scopeId(scopeAtStart) !== scopeId(currentScope))) {
          throw new Error('The Google account changed. Retry changing languages in the intended account.');
        }
        const scope = this.enabled ? this.scope() : null;
        if (scope) {
          this.assertOwner(scope);
          const earlier = readQueue(scope).find(op => op.type === 'settings');
          const baseline = earlier ? earlier.baseline : readBaseline(scope).settings;
          enqueue(scope, { type: 'settings', operation: 'update', payload: settings, baseline });
        }
        this.applySettings(settings);
        this.refreshState(scope);
      });
      this.schedule();
    } catch (error) {
      this.fail(error);
      throw error;
    }
  };

  connect = (): void => {
    void initiateOAuthFlow().catch(error => this.fail(error));
  };

  disconnect = async (): Promise<void> => {
    this.generation++;
    clearTimeout(this.timer);
    const config = getStorageConfig();
    setStorageConfig({ ...config, storageSource: 'local', spreadsheetId: null, connectedEmail: null, oauthTokenExpiry: null });
    const token = await getValidAccessToken().catch(() => null);
    clearStoredTokens();
    this.publish({ conflicts: [], errorMessage: null, sessionExpired: false });
    this.refreshState(null);
    if (token) await revokeOAuthToken(token);
  };

  syncNow = (): Promise<PullResult> => {
    clearTimeout(this.timer);
    if (!this.enabled) return Promise.resolve({ ok: false, reason: 'disabled' });
    if (this.inFlight) {
      this.rerun = true;
      return this.inFlight;
    }
    const scope = this.scope();
    if (!scope) {
      this.refreshState(null);
      return Promise.resolve({ ok: false, reason: 'no_spreadsheet' });
    }
    const generation = this.generation;
    const valid = () => this.enabled && generation === this.generation && scopeId(this.scope() ?? { email: '', spreadsheetId: '' }) === scopeId(scope);
    this.inFlight = (async (): Promise<PullResult> => {
      try {
        await withStorageLock(() => {
          if (!valid()) return;
          this.assertOwner(scope);
          migrateLegacyQueue(scope);
          this.applyQueue(scope);
          this.refreshState(scope);
        });
        if (!valid()) return { ok: false, reason: 'disabled' };
        window.dispatchEvent(new CustomEvent('ordsamling:entries-synced'));
        if (!navigator.onLine) return { ok: false, reason: 'error' };
        if (!navigator.locks) throw new Error('Cloud sync requires browser tab locking. Your changes remain saved on this device.');
        return await navigator.locks.request(`ordsamling-sync:${scopeId(scope)}`, async (): Promise<PullResult> => {
          if (!valid()) return { ok: false, reason: 'disabled' };
          const tokenEmail = getStoredEmail();
          if (tokenEmail && tokenEmail !== scope.email) throw new Error('The signed-in account changed. Finish reconnecting before syncing.');
          const token = await getValidAccessToken();
          if (!valid()) return { ok: false, reason: 'disabled' };
          if (!token) {
            this.publish({ status: 'error', sessionExpired: true, errorMessage: 'session_expired' });
            return { ok: false, reason: 'session_expired' };
          }
          this.publish({ status: 'syncing', errorMessage: null, sessionExpired: false });
          return await this.flush(scope, token, valid);
        });
      } catch (error) {
        if (valid()) this.fail(error);
        return { ok: false, reason: 'error' };
      } finally {
        this.inFlight = null;
        if (this.rerun) {
          this.rerun = false;
          this.schedule();
        }
      }
    })();
    return this.inFlight;
  };

  private async flush(scope: SyncScope, token: string, valid: () => boolean): Promise<PullResult> {
    const snapshot = await this.sheets.readLexiconSnapshot(scope.spreadsheetId, token);
    if (!valid()) return { ok: false, reason: 'disabled' };
    const baseline = readBaseline(scope);
    const queue = await withStorageLock(() => {
      if (!valid()) return [];
      const pending = new Set(readQueue(scope).filter(op => op.type === 'lexicon').map(entryId));
      const remote = new Map(snapshot.entries.map(entry => [entry.id, entry]));
      for (const local of readArray<LexisEntry>(REAL_STORAGE_KEY)) {
        if (pending.has(local.id) || sameContent(local, remote.get(local.id)) ||
          sameContent(local, baseline.entries[local.id])) continue;
        enqueue(scope, {
          type: 'lexicon', operation: remote.has(local.id) ? 'update' : 'add', payload: local,
          baseline: baseline.entries[local.id] ?? (remote.has(local.id) ? undefined : null),
        });
      }
      return readQueue(scope);
    });
    if (!valid()) return { ok: false, reason: 'disabled' };
    const groups = new Map<string, QueuedOperation[]>();
    for (const operation of queue) {
      if (operation.type !== 'lexicon') continue;
      const id = entryId(operation);
      groups.set(id, [...(groups.get(id) ?? []), operation]);
    }
    const remote = new Map(snapshot.entries.map(entry => [entry.id, entry]));
    const changes: LexiconChange[] = [];
    const completed: QueuedOperation[] = [];
    const conflicts: SyncConflict[] = [];
    for (const [id, operations] of groups) {
      const first = operations[0];
      const last = operations[operations.length - 1];
      const desired = desiredEntry(last);
      const actual = remote.get(id) ?? null;
      const base = first.baseline as LexisEntry | null | undefined;
      if (sameContent(actual, desired)) {
        completed.push(...operations);
      } else if (base !== undefined && sameContent(base, actual)) {
        changes.push({ id, entry: desired });
        completed.push(...operations);
      } else {
        conflicts.push({ id, type: 'lexicon', operationIds: operations.map(op => op.id), local: desired, remote: actual });
      }
    }
    for (let offset = 0; offset < changes.length; offset += 100) {
      if (!valid()) return { ok: false, reason: 'disabled' };
      await this.sheets.applyLexiconChanges(scope.spreadsheetId, changes.slice(offset, offset + 100), token, snapshot);
    }
    if (!valid()) return { ok: false, reason: 'disabled' };
    for (const change of changes) {
      if (change.entry) remote.set(change.id, change.entry);
      else remote.delete(change.id);
    }
    let added = 0, updated = 0, removed = 0;
    await withStorageLock(() => {
      if (!valid()) return;
      const current = new Map(readArray<LexisEntry>(REAL_STORAGE_KEY).map(entry => [entry.id, entry]));
      const sentIds = new Set(completed.map(op => op.id));
      const remaining = readQueue(scope).filter(op => !sentIds.has(op.id) && op.type === 'lexicon');
      const pending = new Set(remaining.map(entryId));
      const completedEntryIds = new Set(completed.filter(op => op.type === 'lexicon').map(entryId));
      for (const operation of remaining) {
        if (completedEntryIds.has(entryId(operation))) {
          replaceOperation({ ...operation, baseline: remote.get(entryId(operation)) ?? null });
        }
      }
      for (const [id, entry] of remote) {
        if (pending.has(id)) continue;
        if (!current.has(id)) added++;
        else if (!sameContent(current.get(id), entry)) updated++;
        current.set(id, entry);
      }
      for (const [id] of current) {
        if (!remote.has(id) && !pending.has(id) && (baseline.entries[id] || changes.some(change => change.id === id && !change.entry))) {
          current.delete(id);
          removed++;
        }
      }
      localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify([...current.values()]));
      for (const [id, entry] of remote) {
        if (!pending.has(id) || completedEntryIds.has(id)) baseline.entries[id] = entry;
      }
      for (const id of Object.keys(baseline.entries)) {
        if (!remote.has(id) && !pending.has(id)) delete baseline.entries[id];
      }
      writeBaseline(scope, baseline);
      acknowledge(completed);
      this.applyQueue(scope);
    });

    const settings = await this.sheets.readSettings(scope.spreadsheetId, token);
    if (!valid()) return { ok: false, reason: 'disabled' };
    const settingsOps = queue.filter(op => op.type === 'settings');
    if (settingsOps.length) {
      const desired = settingsOps[settingsOps.length - 1].payload as SheetSettings;
      const actual = settings.present === false ? null : settings;
      const base = settingsOps[0].baseline as SheetSettings | null | undefined;
      if (settingsEqual(actual, desired) || (base !== undefined && settingsEqual(base, actual)) || actual === null) {
        if (!settingsEqual(actual, desired)) await this.sheets.writeSettings(scope.spreadsheetId, desired, token);
        if (!valid()) return { ok: false, reason: 'disabled' };
        await withStorageLock(() => {
          if (!valid()) return;
          baseline.settings = desired;
          writeBaseline(scope, baseline);
          acknowledge(settingsOps);
          for (const operation of readQueue(scope).filter(op => op.type === 'settings')) {
            replaceOperation({ ...operation, baseline: desired });
          }
          this.applyQueue(scope);
        });
      } else {
        conflicts.push({
          id: 'settings', type: 'settings', operationIds: settingsOps.map(op => op.id), local: desired, remote: actual,
        });
      }
    } else {
      await withStorageLock(() => {
        if (!valid()) return;
        if (!readQueue(scope).some(op => op.type === 'settings')) {
          baseline.settings = settings.present === false ? null : settings;
          writeBaseline(scope, baseline);
          if (baseline.settings) this.applySettings(settings);
        }
      });
    }
    for (const operation of queue.filter(op => op.type === 'quiz_history' || op.type === 'streak_event')) {
      if (!valid()) return { ok: false, reason: 'disabled' };
      if (operation.type === 'quiz_history') {
        await this.sheets.appendQuizSession(scope.spreadsheetId, operation.payload as QuizSessionRecord, token);
      } else {
        await this.sheets.appendStreakEvent(scope.spreadsheetId, operation.payload as StreakEvent, token);
      }
      if (!valid()) return { ok: false, reason: 'disabled' };
      await withStorageLock(() => { if (valid()) acknowledge([operation]); });
    }
    this.publish({ conflicts, errorMessage: null, sessionExpired: false, lastSyncAt: Date.now() });
    this.refreshState(scope);
    window.dispatchEvent(new CustomEvent('ordsamling:entries-synced'));
    if (conflicts.length) return { ok: false, reason: 'conflict' };
    return { ok: true, added, updated, removed };
  }

  resolveConflict = async (id: string, choice: 'local' | 'remote'): Promise<void> => {
    const scope = this.scope();
    const conflict = this.state.conflicts.find(item => item.id === id);
    if (!scope || !conflict) return;
    await withStorageLock(() => {
      if (!this.scope() || scopeId(this.scope()!) !== scopeId(scope)) throw new Error('The Google account changed. Reopen the conflict.');
      const queue = readQueue(scope);
      const operations = queue.filter(op => conflict.operationIds.includes(op.id));
      if (choice === 'local') {
        for (const operation of operations) replaceOperation({ ...operation, baseline: conflict.remote });
      } else {
        if (conflict.type === 'lexicon') {
          const entries = readArray<LexisEntry>(REAL_STORAGE_KEY).filter(entry => entry.id !== id);
          if (conflict.remote) entries.push(conflict.remote as LexisEntry);
          localStorage.setItem(REAL_STORAGE_KEY, JSON.stringify(entries));
        } else this.applySettings((conflict.remote as SheetSettings | null) ?? { extraLanguages: [] });
        acknowledge(operations);
        this.applyQueue(scope);
      }
      this.publish({ conflicts: this.state.conflicts.filter(item => item.id !== id) });
      this.refreshState(scope);
    });
    window.dispatchEvent(new CustomEvent('ordsamling:entries-synced'));
    this.schedule(0);
  };
}
