import AxeBuilder from '@axe-core/playwright';
import { test, expect, stateButton, saved } from './fixtures.js';

const PHONE = 'A phone call';
const card = (page, title) => page.locator('.module').filter({ has: page.getByRole('heading', { name: title }) });
const category = (page, name) => page.locator('.category-header h2', { hasText: name });

test.beforeEach(async ({ page }) => {
  await page.getByRole('button', { name: 'Open module library' }).click();
});

test('add, answer, hide and turn on a module, and it survives a reload (M3-04)', async ({ page }) => {
  await card(page, 'Communication preferences').getByRole('button', { name: 'Add Communication preferences' }).click();
  await expect(category(page, 'Ways of contacting me')).toBeVisible();
  await expect(stateButton(page, PHONE)).toHaveText('Unanswered');

  await stateButton(page, PHONE).click();
  await expect(stateButton(page, PHONE)).toHaveText('Unsure');

  await card(page, 'Communication preferences').getByRole('button', { name: 'Hide Communication preferences' }).click();
  await expect(category(page, 'Ways of contacting me')).toHaveCount(0);
  await expect(card(page, 'Communication preferences')).toContainText('Your answers are kept');
  await saved(page);

  await page.reload();
  await expect(category(page, 'Ways of contacting me')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open module library' }).click();
  await card(page, 'Communication preferences').getByRole('button', { name: 'Turn on Communication preferences' }).click();
  await expect(stateButton(page, PHONE)).toHaveText('Unsure');
});

test('undo takes a module back out (M3-04)', async ({ page }) => {
  await card(page, 'Sensory profile').getByRole('button', { name: 'Add Sensory profile' }).click();
  await expect(category(page, 'Sound')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(category(page, 'Sound')).toHaveCount(0);
});

test('the library is usable by keyboard (M3-04)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  const add = card(page, 'Personal space and proximity').getByRole('button', { name: 'Add Personal space and proximity' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(category(page, 'How close people are')).toBeVisible();
});

test('the library has no serious accessibility violations in any theme (M3-04)', async ({ page }) => {
  for (const theme of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label: theme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, theme).toEqual([]);
  }
});
