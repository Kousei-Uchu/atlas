// M8-06: a child audience inherits a narrower override from its parent, never a wider one (D-073).
import { test, expect, saved, HUG, tab } from './fixtures.js';

const row = (page, label) => page.locator('.item-row').filter({ hasText: label }).first();
const live = (page) => page.locator('[role="status"][aria-live="polite"]');

async function addAudience(page, name, kind) {
  await tab(page, 'Share');
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill(name);
  await page.getByLabel('Kind of audience').selectOption({ label: kind });
  await page.getByRole('button', { name: 'Add audience' }).click();
  await page.getByRole('button', { name: /^Close audiences/ }).click();
}

test('a child inherits a narrower parent override, says so, and a direct override wins (D-073)', async ({ page }) => {
  await addAudience(page, 'Friends', 'Friends');
  await addAudience(page, 'Close ones', 'Close friends');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open relationship graph' }).click();
  await page.getByLabel('Place Close ones inside').selectOption({ label: 'Friends' });
  await expect(live(page)).toContainText('Close ones is inside Friends');
  await page.getByRole('button', { name: /^Close relationship graph/ }).click();

  await tab(page, 'Chart');
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  const fx = row(page, HUG).getByTestId('audience-effect');
  await row(page, HUG).getByRole('combobox', { name: /Friends.*sees/ }).selectOption({ label: 'No' });
  await expect(fx.filter({ hasText: 'Close ones sees No' })).toContainText('inherited from Friends');

  // The child's own, more open setting is a deliberate direct choice, so it wins.
  await row(page, HUG).getByRole('combobox', { name: /Close ones.*sees/ }).selectOption({ label: 'Yes' });
  await expect(fx.filter({ hasText: 'Close ones sees Yes' })).toContainText('because of an override');
  await saved(page);
});

test('a parent override that is more open than your answer is not passed down (D-073)', async ({ page }) => {
  await addAudience(page, 'Friends', 'Friends');
  await addAudience(page, 'Close ones', 'Close friends');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open relationship graph' }).click();
  await page.getByLabel('Place Close ones inside').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: /^Close relationship graph/ }).click();

  await tab(page, 'Chart');
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  await row(page, HUG).getByRole('combobox', { name: /Friends.*sees/ }).selectOption({ label: 'Yes' });
  await expect(row(page, HUG).getByTestId('audience-effect').filter({ hasText: 'Close ones' }))
    .toContainText('Nothing is answered');
});
