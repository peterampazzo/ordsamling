/**
 * migration.ts — Atomic cut-over migration from localStorage to Google Sheets.
 *
 * The key guarantee: storageSource is only set to 'google_sheets' AFTER all
 * data has been successfully uploaded. If any step fails, local data is
 * untouched and storageSource remains 'local'.
 */

import type { LexisEntry } from '@/lib/lexicon';
import type { QuizSessionRecord } from '@/lib/quizHistory';
import { GoogleSheetsService } from '@/services/GoogleSheetsService';
import { getStoredEmail } from '@/lib/googleOAuth';
import { setStorageConfig } from '@/lib/storageConfig';
import { getExtraLanguages } from '@/lib/settings';

// ---------------------------------------------------------------------------
// Drive file search
// ---------------------------------------------------------------------------

/**
 * Search the user's Drive for an existing "Ordsamling Data" spreadsheet.
 * Returns the first matching file's id, or null if none found.
 * Throws on non-2xx response.
 */
export async function findExistingSpreadsheet(accessToken: string): Promise<string | null> {
  const url =
    "https://www.googleapis.com/drive/v3/files" +
    "?q=name%3D'Ordsamling+Data'+and+mimeType%3D'application%2Fvnd.google-apps.spreadsheet'+and+trashed%3Dfalse" +
    "&fields=files(id,name)" +
    "&spaces=drive";

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Drive API error ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as { files?: Array<{ id: string; name: string }> };
  const files = data.files ?? [];
  return files.length > 0 ? files[0].id : null;
}

// ---------------------------------------------------------------------------
// Main migration function
// ---------------------------------------------------------------------------

/**
 * Atomic cut-over migration from localStorage to Google Sheets.
 *
 * Steps 1-7 must ALL succeed before step 8 (the cut-over) executes.
 * If any step throws, storageSource remains 'local' and local data is untouched.
 *
 * Idempotent reconnect: if a spreadsheet already exists, it is reused.
 * Data is only written if entries.length > 0 or history.length > 0.
 */
export async function runMigration(
  accessToken: string,
  entries: LexisEntry[],
  history: QuizSessionRecord[]
): Promise<{ spreadsheetId: string; email: string }> {
  const sheetsService = new GoogleSheetsService();

  // Step 1: Fetch user email
  let email = getStoredEmail();
  if (!email) {
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoResponse.ok) {
      throw new Error(`Failed to fetch user info: ${userInfoResponse.status}`);
    }
    const userInfo = (await userInfoResponse.json()) as { email: string };
    email = userInfo.email;
  }

  // Step 2: Search Drive for existing spreadsheet
  let spreadsheetId = await findExistingSpreadsheet(accessToken);

  // Step 3: Create new spreadsheet if not found
  if (!spreadsheetId) {
    spreadsheetId = await sheetsService.createSpreadsheet(accessToken);
  }

  // Step 4: Ensure tabs exist
  await sheetsService.ensureTabsExist(spreadsheetId, accessToken);

  // Step 5: Batch write entries if any
  if (entries.length > 0) {
    await sheetsService.batchWriteLexicon(spreadsheetId, entries, accessToken);
  }

  // Step 6: Batch write history if any
  if (history.length > 0) {
    await sheetsService.batchWriteQuizHistory(spreadsheetId, history, accessToken);
  }

  // Step 7: Write current settings (only extraLanguages — other prefs are device-local)
  await sheetsService.writeSettings(spreadsheetId, {
    extraLanguages: getExtraLanguages(),
  }, accessToken);

  // *** ATOMIC CUT-OVER (only reached if all above succeeded) ***
  // Step 8: Switch storageSource to google_sheets
  setStorageConfig({
    storageSource: 'google_sheets',
    spreadsheetId,
    connectedEmail: email,
    oauthTokenExpiry: null,
  });

  // *** CLEANUP ***
  // Step 9: Remove local data now that it's safely in the cloud
  localStorage.removeItem('lexikon-entries');
  localStorage.removeItem('lexikon-quiz-history');
  // Also remove demo-mode variants if present
  localStorage.removeItem('lexikon-entries-demo');
  localStorage.removeItem('lexikon-quiz-history-demo');

  return { spreadsheetId, email };
}
