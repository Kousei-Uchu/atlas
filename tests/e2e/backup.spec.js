import { readFileSync } from 'node:fs';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

test('downloads a full backup and imports it as a new profile', async ({ page }) => {
  await stateButton(page, HUG).click(); // Unsure
  await saved(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download full backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^atlas-backup-my-profile-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  expect(backup).toMatchObject({ format: 'atlas-backup', kind: 'full-profile', formatVersion: 1 });

  await page.getByLabel('Choose a backup file (.json)').setInputFiles(path);
  const preview = page.getByRole('region', { name: 'Import preview' });
  await expect(preview).toContainText('Ready to import: My profile');
  await preview.getByRole('button', { name: 'Import as new profile' }).click();
  await expect(preview).toBeHidden();

  // Two profiles now exist, and the copy kept the answer.
  await expect(page.getByLabel('Open a profile').locator('option')).toHaveCount(2);
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
});

test('refuses a bad file with a readable message and changes nothing', async ({ page }) => {
  await page.getByLabel('Choose a backup file (.json)').setInputFiles({
    name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ definitely not json'),
  });
  await expect(page.getByText('Nothing was imported and your existing profiles are unchanged.')).toBeVisible();
  await expect(page.getByLabel('Open a profile').locator('option')).toHaveCount(1);
});
