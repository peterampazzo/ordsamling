import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createSyncFixture, scope } from '@/test/syncFixture';
import { getExtraLanguages, setExtraLanguages } from '@/lib/settings';
import { readQueue } from '@/lib/syncQueue';

describe('Settings synchronization', () => {
  let fixture: ReturnType<typeof createSyncFixture>;
  beforeEach(() => { fixture = createSyncFixture(); });
  afterEach(() => fixture.dispose());

  it('persists language changes before network debounce', async () => {
    await fixture.engine.syncNow();
    await setExtraLanguages(['it']);
    expect(getExtraLanguages()).toEqual(['it']);
    expect(readQueue(scope)).toHaveLength(1);
    expect(fixture.writeSettings).not.toHaveBeenCalled();
    await fixture.engine.syncNow();
    expect(fixture.writeSettings).toHaveBeenCalledWith(scope.spreadsheetId, { extraLanguages: ['it'] }, 'token');
  });

  it('preserves local languages when the sheet has no settings', async () => {
    localStorage.setItem('ordsamling-extra-languages', '["it","fr"]');
    await fixture.engine.syncNow();
    expect(getExtraLanguages()).toEqual(['it', 'fr']);
  });

  it('accepts an explicitly empty remote list', async () => {
    localStorage.setItem('ordsamling-extra-languages', '["it","fr"]');
    fixture.setSettings({ extraLanguages: [], present: true });
    await fixture.engine.syncNow();
    expect(getExtraLanguages()).toEqual([]);
  });

  it('coalesces rapid changes into one write with the latest list', async () => {
    await fixture.engine.syncNow();
    await setExtraLanguages(['it']);
    await setExtraLanguages(['it', 'fr']);
    await setExtraLanguages(['it', 'fr', 'de']);
    await fixture.engine.syncNow();
    expect(fixture.writeSettings).toHaveBeenCalledTimes(1);
    expect(fixture.writeSettings).toHaveBeenCalledWith(scope.spreadsheetId, { extraLanguages: ['it', 'fr', 'de'] }, 'token');
  });

  it('does not overwrite pending language changes with a concurrent remote edit', async () => {
    fixture.setSettings({ extraLanguages: ['it'], present: true });
    await fixture.engine.syncNow();
    await setExtraLanguages(['fr']);
    fixture.setSettings({ extraLanguages: ['de'], present: true });
    await fixture.engine.syncNow();
    expect(getExtraLanguages()).toEqual(['fr']);
    expect(fixture.engine.getSnapshot().status).toBe('conflict');
    await fixture.engine.resolveConflict('settings', 'remote');
    expect(getExtraLanguages()).toEqual(['de']);
  });

  it('does not dirty the queue when applying incoming settings', async () => {
    fixture.setSettings({ extraLanguages: ['de'], present: true });
    await fixture.engine.syncNow();
    expect(readQueue(scope)).toEqual([]);
    expect(fixture.writeSettings).not.toHaveBeenCalled();
  });
});
