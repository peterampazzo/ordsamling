import { test, expect } from '@playwright/test';

const vocabularyDocx = Buffer.from(
  'UEsDBBQAAAAIAAAAIVD3VP4j2QAAAGQBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbJWQu1LDMBBFf0WjlrHWUDAMYzsFjxIowgfsyGtbg16jVUL4e9YJSZGOUrpn75G22xyCV3sq7FLs9a1ptaJo0+ji3OvP7WvzoDdDt/3JxErQyL1eas2PAGwXCsgmZYqSTKkErHIsM2S0XzgT3LXtPdgUK8Xa1LVDD90zTbjzVb0c5PqkLeRZq6cTuLp6jTl7Z7FKDvs4XlmaP4ORySPDi8t8I4CGoXuX/xQ3kvrAUt8wSB18pzLCmOwuiMKs4L98aZqcpcv82pZLssQsiwreXJKALp7fAce1Db9QSwMEFAAAAAgAAAAhUDZX3tyiAAAAGAEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3qkLA0KoaReE1BWVA0SJm0Y0DyXhdXsyMFDEwGj792e56R52ZjeKyXjHYV3VwMhJr4zTHM7DcbWDrm1ONItcEmkyIbGy4hKHKeewR0xyIitS5QO5Mhl9tCKXMmoMQl6EJtzU9RbjpwFLk/WKQ+zVGtjwDPSP7cfRSDp4ebXk8o8TX4kii6gpc7j7qFC921VhAdsGFy+2L1BLAwQUAAAACAAAACFQIrWfjJoAAADGAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sRY5LDsIwDESvEmVPXVggVPWz6wngAG0SmkqNHTkphQtxES5GUhZs3sgz9sh193SLeBgOM2Ejj0UphUFFesapkbdrf7jIrq23SpNancEo0j6GamukjdFXAEFZ44ZQkDeYsjuxG2IaeYKNWHsmZUJIdW6BU1mewQ0zylw5kn5l9RmcEVu7BmFX1OLzHhdTQ/Yyeaff+buD/0/tF1BLAQIUAxQAAAAIAAAAIVD3VP4j2QAAAGQBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAAAAhUDZX3tyiAAAAGAEAAAsAAAAAAAAAAAAAAIABCgEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAAAAhUCK1n4yaAAAAxgAAABEAAAAAAAAAAAAAAIAB1QEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAAJ4CAAAAAA==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ordsamling-lang', 'en'));
});

test('extracts Danish text from a real DOCX using the browser library', async ({ page }) => {
  await page.goto('/import');
  await page.locator('label[for="method-ai"]').click();
  await page.getByLabel('Upload document file').setInputFiles({
    name: 'vocabulary.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: vocabularyDocx,
  });
  await expect(page.getByRole('textbox', { name: 'Generated AI prompt' })).toHaveValue(/hus hund æble/);
  await expect(page.getByRole('button', { name: 'Remove uploaded file' })).toBeVisible();
});

test('handles an invalid DOCX without creating an AI prompt', async ({ page }) => {
  await page.goto('/import');
  await page.locator('label[for="method-ai"]').click();
  await page.getByLabel('Upload document file').setInputFiles({
    name: 'invalid.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('Not a ZIP archive'),
  });
  await expect(page.getByText(/Can't find end of central directory/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Generated AI prompt' })).toHaveCount(0);
});

test('preserves client navigation, history redirects, and unknown-route handling', async ({ page }) => {
  await page.goto('/app');
  await page.locator('a[href="/quiz"]').first().click();
  await expect(page).toHaveURL(/\/quiz$/);
  await expect(page.getByRole('radio', { name: /Numbers/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/quiz/history');
  await expect(page).toHaveURL(/\/progress\?tab=sessions$/);
  await page.goto('/missing-route');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  await page.locator('a[href="/"]').click();
  await expect(page).toHaveURL(/\/$/);
});

test('preserves OAuth callback query parameters', async ({ page }) => {
  await page.goto('/oauth/callback?error=access_denied');
  await expect(page.getByRole('heading', { name: 'Connection failed' })).toBeVisible();
  await expect(page.getByText('Google returned an error: access_denied')).toBeVisible();
});
