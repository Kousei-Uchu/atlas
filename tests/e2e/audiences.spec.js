import AxeBuilder from '@axe-core/playwright';
import { test, expect, stateButton, saved, HUG, tab } from './fixtures.js';

const row = (page, label) => page.locator('.item-row').filter({ hasText: label }).first();

async function addAudience(page, name, kind = 'Friends') {
  await tab(page, 'Share');
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill(name);
  await page.getByLabel('Kind of audience').selectOption({ label: kind });
  await page.getByRole('button', { name: 'Add audience' }).click();
}

test('an audience can see something different from the default, the answer stays, and it survives a reload (M4-03, I-04)', async ({ page }) => {
  await stateButton(page, HUG).click();
  const answer = await stateButton(page, HUG).innerText();
  expect(answer).not.toBe('Unanswered');

  await addAudience(page, 'My friends');
  await expect(page.getByRole('listitem', { name: 'My friends' })).toBeVisible();

  await tab(page, 'Chart');
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  const select = row(page, HUG).getByRole('combobox', { name: /My friends.*sees/ });
  await expect(select).toHaveValue('');
  await expect(row(page, HUG).getByTestId('audience-effect')).toContainText('which is your own answer');

  await select.selectOption({ label: 'Yes' });
  await expect(row(page, HUG).getByTestId('audience-effect')).toContainText('My friends sees Yes because of an override');
  await expect(row(page, HUG).getByTestId('audience-effect')).toContainText('This shows more than your own answer does');
  await row(page, HUG).getByLabel('Reason for My friends (optional)').fill('We are close');
  await tab(page, 'Chart');
  await expect(stateButton(page, HUG)).toHaveText(answer); // the item's own answer did not move
  await saved(page);

  await page.reload();
  await tab(page, 'Share');
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByRole('button', { name: 'Show overrides for My friends' }).click();
  await expect(page.getByRole('listitem', { name: 'My friends' })).toContainText('Your reason: We are close');
  await tab(page, 'Chart');
  await expect(stateButton(page, HUG)).toHaveText(answer);

  // Removing the override puts the audience back on the person's own answer.
  await tab(page, 'Share');
  await page.getByRole('button', { name: /^Remove the override for A hug from a friend/ }).click();
  await expect(page.getByRole('listitem', { name: 'My friends' })).toContainText('No overrides');
});

test('deleting an audience asks first, and undo brings it back with its override (M4-03)', async ({ page }) => {
  await addAudience(page, 'Family', 'Family');
  await tab(page, 'Chart');
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  await row(page, HUG).getByRole('combobox', { name: /Family.*sees/ }).selectOption({ label: 'No' });

  await tab(page, 'Share');
  await page.getByRole('button', { name: 'Delete Family' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('its 1 override');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('listitem', { name: 'Family' })).toBeVisible();

  await tab(page, 'Share');
  await page.getByRole('button', { name: 'Delete Family' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete audience' }).click();
  await expect(page.getByRole('listitem', { name: 'Family' })).toHaveCount(0);
  await expect(row(page, HUG).getByRole('button', { name: /^Audiences/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('listitem', { name: 'Family' })).toBeVisible();
  await page.getByRole('button', { name: 'Show overrides for Family' }).click();
  await expect(page.getByRole('listitem', { name: 'Family' })).toContainText('sees No because of an override');
});

test('the audiences screen and an item’s audience section have no serious accessibility violations in any theme (M4-03)', async ({ page }) => {
  await addAudience(page, 'Colleagues', 'School or work');
  await page.getByRole('button', { name: 'Show overrides for Colleagues' }).click();
  await tab(page, 'Chart');
  await row(page, HUG).getByRole('button', { name: /^Audiences/ }).click();
  await row(page, HUG).getByRole('combobox', { name: /Colleagues.*sees/ }).selectOption({ label: 'Conditional' });
  for (const theme of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label: theme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, theme).toEqual([]);
  }
});

test('the audiences screen is usable by keyboard (M4-03)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  await tab(page, 'Share');
  await page.getByRole('button', { name: /^Open audiences/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Name of the audience').focus();
  await page.keyboard.type('Neighbours');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listitem', { name: 'Neighbours' })).toBeVisible();
});
