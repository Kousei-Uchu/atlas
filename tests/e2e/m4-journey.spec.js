import fs from 'node:fs';
import { test, expect, stateButton, saved, HUG, tab } from './fixtures.js';

const row = (page, label) => page.locator('.item-row').filter({ hasText: label }).first();
const read = async (download) => fs.readFileSync(await download.path(), 'utf8');
const exportMd = async (page) => {
  await tab(page, 'Share');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Markdown' }).click()]);
  return read(file);
};

test('M4 journey: answer, give an audience a different answer, build a view, export, reload (M4-08)', async ({ page }) => {
  // The person's own answer.
  await tab(page, 'Chart');
  await stateButton(page, HUG).click();
  const own = (await stateButton(page, HUG).innerText()).replace(/^.*?:\s*/, '').trim();
  await tab(page, 'Share');
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill('Friends');
  await page.getByLabel('Kind of audience').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Add audience' }).click();

  // A note that is private until it is shared on purpose.
  await tab(page, 'Chart');
  await row(page, HUG).getByRole('button', { name: /^Note/ }).click();
  await row(page, HUG).getByRole('textbox').first().fill('M4-JOURNEY-NOTE');

  // An override for Friends only.
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  await row(page, HUG).getByRole('combobox', { name: /Friends.*sees/ }).selectOption({ label: 'Conditional' });

  // A view for Friends with that item.
  await tab(page, 'Share');
  await page.getByRole('button', { name: 'Open views' }).click();
  await page.getByLabel('Name of the view').fill('Friends view');
  await page.getByLabel('Who it is for').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Make view' }).click();
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();

  // The export shows the audience's answer, not the person's own, and no private note.
  let md = await exportMd(page);
  expect(md).toContain(HUG);
  expect(md).toContain('Conditional');
  expect(md).not.toContain('M4-JOURNEY-NOTE');
  expect(own).not.toBe('Conditional');

  // A note needs both switches: the view's and the note's own.
  await page.getByRole('checkbox', { name: /^Include notes/ }).check();
  md = await exportMd(page);
  expect(md).not.toContain('M4-JOURNEY-NOTE');
  await tab(page, 'Chart');
  await row(page, HUG).getByRole('checkbox', { name: /share/i }).check();
  md = await exportMd(page);
  expect(md).toContain('M4-JOURNEY-NOTE');
  await tab(page, 'Chart');
  await expect(stateButton(page, HUG)).toContainText(own); // the person's own answer never moved (I-04)

  await saved(page);
  await page.reload();
  await tab(page, 'Share');
  await page.getByRole('button', { name: 'Open views' }).click();
  await expect(page.getByRole('listitem', { name: 'Friends view' })).toContainText('1 item included');
  expect(page.external ?? []).toEqual([]);
});
