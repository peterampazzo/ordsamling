import { createContext } from 'react';
import type { SyncEngine } from '@/services/SyncEngine';

export const GoogleSheetsContext = createContext<SyncEngine | null>(null);
