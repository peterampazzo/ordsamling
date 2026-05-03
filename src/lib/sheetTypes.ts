export interface SheetSettings {
  extraLanguages: string[];
}

export const LEXICON_HEADERS = ['ID', 'Danish', 'English', 'Translations', 'Type', 'Grammar', 'Notes', 'CreatedAt'] as const;
export const QUIZ_HISTORY_HEADERS = ['ID', 'Date', 'Mode', 'FromLabel', 'ToLabel', 'Score', 'Total', 'Answers'] as const;
export const SETTINGS_HEADERS = ['Key', 'Value'] as const;
