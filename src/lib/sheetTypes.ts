export interface SheetSettings {
  extraLanguages: string[];
  uiLang?: string;
}

export interface StreakEvent {
  timestamp: number;
  type: 'extended' | 'broken' | 'reset';
  deviceId?: string;
  notes?: string;
}

export const LEXICON_HEADERS = ['ID', 'Danish', 'English', 'Translations', 'Type', 'Grammar', 'Notes', 'CreatedAt', 'UpdatedAt'] as const;
export const QUIZ_HISTORY_HEADERS = ['ID', 'Date', 'Mode', 'FromLabel', 'ToLabel', 'Score', 'Total', 'Answers'] as const;
export const STREAK_HISTORY_HEADERS = ['Timestamp', 'Type', 'DeviceId', 'Notes'] as const;
export const SETTINGS_HEADERS = ['Key', 'Value'] as const;
