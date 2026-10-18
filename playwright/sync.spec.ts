import { test, expect, type BrowserContext, type Page } from '@playwright/test';

async function mockCloud(context: BrowserContext) {
  const state = { unavailable: false, rows: [] as string[][], calls: 0 };
  await context.addInitScript(() => {
    if (localStorage.getItem('test-seeded')) return;
    localStorage.setItem('test-seeded', '1');
    localStorage.setItem('ordsamling-lang', 'en');
    localStorage.setItem('ordsamling-storage-config', JSON.stringify({
      storageSource: 'google_sheets', spreadsheetId: 'test-sheet', connectedEmail: 'test@example.com', oauthTokenExpiry: null,
    }));
    localStorage.setItem('ordsamling-oauth-tokens', JSON.stringify({
      accessToken: 'test-access', refreshToken: 'test-refresh', email: 'test@example.com', tokenExpiry: Date.now() + 3600_000,
    }));
  });
  await context.route('https://sheets.googleapis.com/**', async route => {
    state.calls++;
    if (state.unavailable) return route.fulfill({ status: 503, body: '{}' });
    const request = route.request();
    const url = decodeURIComponent(request.url());
    let values: string[][] = [];
    if (request.method() === 'GET' && url.includes('Lexicon!')) values = state.rows;
    else if (request.method() === 'GET' && url.includes('Settings!')) values = [['extraLanguages', '[]']];
    else if (url.includes('/values:batchUpdate')) {
      const body = request.postDataJSON() as { data: Array<{ range: string; values: string[][] }> };
      for (const update of body.data) {
        const index = Number(update.range.match(/A(\d+)/)?.[1]) - 2;
        state.rows[index] = update.values[0];
      }
    } else if (request.method() === 'POST' && url.includes('Lexicon!') && url.includes(':append')) {
      state.rows.push(...(request.postDataJSON() as { values: string[][] }).values);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ values }) });
  });
  return state;
}

async function addEntry(page: Page, danish: string, english: string) {
  await page.getByRole('button', { name: 'Add a new word', exact: true }).click();
  await page.getByRole('textbox', { name: 'Danish', exact: true }).fill(danish);
  await page.getByRole('textbox', { name: 'English', exact: true }).fill(english);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

async function journalSize(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('ordsamling-journal:')).length);
}

test('a queued edit survives navigation and reload before the cloud is reachable', async ({ context, page }) => {
  const cloud = await mockCloud(context);
  await page.goto('/app');
  await expect(page.getByRole('button', { name: 'Add a new word', exact: true })).toBeVisible();
  cloud.unavailable = true;
  await addEntry(page, 'hund', 'dog');
  await expect.poll(() => journalSize(page)).toBeGreaterThan(0);
  await page.locator('a[href="/quiz"]').first().click();
  await expect(page).toHaveURL(/\/quiz$/);
  await page.reload();
  await expect.poll(() => journalSize(page)).toBeGreaterThan(0);
  cloud.unavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => cloud.rows.filter(row => row[1] === 'hund').length).toBe(1);
  await expect.poll(() => journalSize(page)).toBe(0);
});

test('two tabs serialize uploads without duplicating or losing entries', async ({ context, page }) => {
  const cloud = await mockCloud(context);
  await page.goto('/app');
  const other = await context.newPage();
  await other.goto('/app');
  await Promise.all([addEntry(page, 'hund', 'dog'), addEntry(other, 'kat', 'cat')]);
  await expect.poll(() => cloud.rows.filter(row => row[0]).length).toBe(2);
  await expect.poll(() => journalSize(page)).toBe(0);
  const ids = cloud.rows.filter(row => row[0]).map(row => row[0]);
  expect(new Set(ids).size).toBe(2);
  await expect(page.getByText('kat', { exact: true }).first()).toBeVisible();
  await expect(other.getByText('hund', { exact: true }).first()).toBeVisible();
});

test('opening the demo does not sync or change real entries', async ({ context, page }) => {
  const cloud = await mockCloud(context);
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Add a new word', exact: true })).toBeVisible();
  expect(cloud.calls).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('lexikon-entries'))).toBeNull();
});

test('deleting a synchronized entry does not restore it on refresh', async ({ context, page }) => {
  const cloud = await mockCloud(context);
  await page.goto('/app');
  await addEntry(page, 'hund', 'dog');
  await expect.poll(() => cloud.rows.filter(row => row[0]).length).toBe(1);
  await page.getByText('hund', { exact: true }).first().hover();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => cloud.rows.filter(row => row[0]).length).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add a new word', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lexikon-entries') || '[]'))).toEqual([]);
});

test('a generated quiz can finish without visiting the notebook and saves one session', async ({ context, page }) => {
  await mockCloud(context);
  await page.goto('/quiz');
  await page.getByRole('radio', { name: /Numbers/ }).click();
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: i === 4 ? 'See result' : 'Next →', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeAttached();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('lexikon-quiz-history') || '[]'));
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ exercise: 'numbers', total: 5, score: 0 });
  expect(history[0].answers).toHaveLength(5);
});
