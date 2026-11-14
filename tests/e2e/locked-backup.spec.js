// M8-04: a backup locked with a password, through the production build (D-071).
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { test, expect, HUG, stateButton, saved, tab } from './fixtures.js';

const PASSWORD = 'three plain words here';

async function lockedDownload(page) {
  await tab(page, 'Settings');
  await page.getByLabel('Password (at least', { exact: false }).fill(PASSWORD);
  await page.getByLabel('Type the password again').fill(PASSWORD);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download locked backup' }).click(),
  ]);
  return download;
}

test('lock a backup with a password, then unlock it and import it as a new profile (M8-04)', async ({ page }) => {
  await stateButton(page, HUG).click(); // Unsure
  await saved(page);

  const download = await lockedDownload(page);
  expect(download.suggestedFilename()).toMatch(/^atlas-backup-my-profile-\d{4}-\d{2}-\d{2}-locked\.json$/);
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  const file = JSON.parse(text);
  expect(file).toMatchObject({ format: 'atlas-locked-backup', formatVersion: 1, kdf: { name: 'PBKDF2-SHA256', rounds: 600000 }, cipher: { name: 'AES-256-GCM' } });
  for (const word of ['My profile', 'atlas-backup"', 'categories', HUG, PASSWORD]) expect(text).not.toContain(word);
  await tab(page, 'Settings');
  await expect(page.locator('[role="status"][aria-live="polite"]')).toContainText('Locked backup downloaded');
  // The password fields are emptied after use.
  await expect(page.getByLabel('Type the password again')).toHaveValue('');

  await page.getByLabel('Choose a backup file (.json)').setInputFiles(path);
  const locked = page.getByRole('region', { name: 'Locked backup' });
  await expect(locked).toBeVisible();
  await expect(page.getByRole('region', { name: 'Import preview' })).toHaveCount(0);

  // A wrong password gives one plain answer and no data; the file stays waiting for another try.
  await locked.getByLabel('Password for this backup').fill('definitely the wrong one');
  await locked.getByRole('button', { name: 'Unlock backup' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'did not unlock this file' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Import preview' })).toHaveCount(0);
  await expect(page.getByLabel('Open a profile').locator('option')).toHaveCount(1);

  await locked.getByLabel('Password for this backup').fill(PASSWORD);
  await locked.getByRole('button', { name: 'Unlock backup' }).click();
  const preview = page.getByRole('region', { name: 'Import preview' });
  await expect(preview).toContainText('Ready to import: My profile');
  await expect(locked).toHaveCount(0);
  await preview.getByRole('button', { name: 'Import as new profile' }).click();
  await expect(page.getByLabel('Open a profile').locator('option')).toHaveCount(2);
  await tab(page, 'Chart');
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
});

test('a short password or two different passwords write no file (M8-04)', async ({ page }) => {
  await tab(page, 'Settings');
  await page.getByLabel('Password (at least', { exact: false }).fill('short');
  await page.getByLabel('Type the password again').fill('short');
  await page.getByRole('button', { name: 'Download locked backup' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'at least 12 characters' })).toBeVisible();

  await page.getByLabel('Password (at least', { exact: false }).fill(PASSWORD);
  await page.getByLabel('Type the password again').fill(`${PASSWORD}x`);
  await page.getByRole('button', { name: 'Download locked backup' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'not the same' })).toBeVisible();
});

test('a damaged or forged locked file is refused with a readable message and changes nothing (M8-04)', async ({ page }) => {
  await stateButton(page, HUG).click();
  const path = await (await lockedDownload(page)).path();
  const file = JSON.parse(readFileSync(path, 'utf8'));
  file.kdf.rounds = 2_000_000_000;   // a file asking the browser for absurd work is refused before any work
  await tab(page, 'Settings');
  await page.getByLabel('Choose a backup file (.json)').setInputFiles({
    name: 'forged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.getByRole('region', { name: 'Locked backup' })).toHaveCount(1);
  await page.getByLabel('Password for this backup').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock backup' }).click();
  await expect(page.getByText('Nothing was imported and your existing profiles are unchanged.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Locked backup' })).toHaveCount(0);
  await expect(page.getByLabel('Open a profile').locator('option')).toHaveCount(1);
});

test('axe finds nothing serious in any theme, and it reflows at 320 px', async ({ page }) => {
  await stateButton(page, HUG).click();
  const path = await (await lockedDownload(page)).path();
  await tab(page, 'Settings');
  await page.getByLabel('Choose a backup file (.json)').setInputFiles(path);
  await expect(page.getByRole('region', { name: 'Locked backup' })).toBeVisible();
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
