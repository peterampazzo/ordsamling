import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SyncEngine } from '@/services/SyncEngine';
import { SyncStatusBanner } from './SyncStatusBanner';
import { GoogleSheetsContext } from '@/lib/syncContext';

export function GoogleSheetsProvider({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new SyncEngine());
  const syncState = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const { pathname } = useLocation();
  const enabled = ['/app', '/quiz', '/import', '/progress'].some(path => pathname === path || pathname.startsWith(`${path}/`));
  useEffect(() => { engine.setEnabled(enabled); }, [engine, enabled]);
  useEffect(() => engine.start(), [engine]);
  return (
    <GoogleSheetsContext.Provider value={engine}>
      {enabled && <SyncStatusBanner syncState={syncState} onReconnect={engine.connect}
        onRetry={() => { void engine.syncNow(); }} onResolve={engine.resolveConflict} />}
      {children}
    </GoogleSheetsContext.Provider>
  );
}
