// M8-05: number, date and choice items, through the production build (D-072).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, saved, tab } from './fixtures.js';

const live = (page) => page.locator('[role="status"][aria-live="polite"]');

async function addValueItem(page, { type, name, unit, options }) {
  const form = page.locator('details.add-value').first();
  if (!(await form.evaluate((d) => d.open))) await form.locator('summary').click();
  await form.getByLabel('Kind of item').selectOption({ label: type });
  await form.getByLabel(/^Name of the new/).fill(name);
  if (unit) await form.getByLabel(/^Unit, if any/).fill(unit);
  if (options) await form.getByLabel(/^Options, one per line/).fill(options);
  await form.getByRole('button', { name: /^Add (number|date|choice) item$/ }).click();
  await expect(live(page)).toContainText(`${name} added`);
}

test('add a number, a date and a choice item, answer them, and find them again after a reload (M8-05)', async ({ page }) => {
  await addValueItem(page, { type: 'Number', name: 'Hours of sleep', unit: 'hours' });
  await addValueItem(page, { type: 'Date', name: 'Last check-in' });
  await addValueItem(page, { type: 'Choice from a list', name: 'Good times', options: 'Mornings\nEvenings\n' });

  const number = page.getByRole('textbox', { name: 'Answer for Hours of sleep (hours)' });
  await number.fill('7.50');
  await number.press('Enter');
  await expect(live(page)).toContainText('Hours of sleep: answer saved');
  await expect(number).toHaveValue('7.5');                       // shown in the one kept form

  await number.fill('lots');
  await number.blur();
  await expect(page.getByRole('alert').filter({ hasText: 'Use digits' })).toBeVisible();
  await expect(page.locator('.value-controls .hint').filter({ hasText: 'Use digits' })).toBeVisible();
  await expect(number).toHaveAttribute('aria-invalid', 'true');
  await number.fill('7.5');                                        // back to the stored value clears nothing to save
  await number.blur();

  await page.getByLabel('Answer for Last check-in').fill('2026-11-12');
  await expect(page.getByLabel('Answer for Last check-in')).toHaveValue('2026-11-12');

  const group = page.getByRole('group', { name: 'Choices for Good times' });
  await expect(group.getByRole('checkbox')).toHaveCount(2);
  await group.getByRole('checkbox', { name: 'Evenings' }).check();
  await expect(group.getByRole('checkbox', { name: 'Evenings' })).toBeChecked();

  // Edit the options: keep Evenings (its answer stays), drop Mornings, add Weekends.
  await page.getByRole('button', { name: 'Edit options for Good times' }).click();
  await page.getByLabel(/^Options for Good times, one per line/).fill('Evenings\nWeekends');
  await page.getByRole('button', { name: 'Save options' }).click();
  await expect(group.getByRole('checkbox')).toHaveCount(2);
  await expect(group.getByRole('checkbox', { name: 'Evenings' })).toBeChecked();
  await expect(group.getByRole('checkbox', { name: 'Weekends' })).not.toBeChecked();
  await expect(group.getByRole('checkbox', { name: 'Mornings' })).toHaveCount(0);

  await saved(page);
  await page.reload();
  await tab(page, 'Chart');
  await expect(page.getByRole('textbox', { name: 'Answer for Hours of sleep (hours)' })).toHaveValue('7.5');
  await expect(page.getByLabel('Answer for Last check-in')).toHaveValue('2026-11-12');
  await expect(page.getByRole('group', { name: 'Choices for Good times' }).getByRole('checkbox', { name: 'Evenings' })).toBeChecked();
});

test('a choice item needs an option, and a date can be cleared (M8-05)', async ({ page }) => {
  const form = page.locator('details.add-value').first();
  await form.locator('summary').click();
  await form.getByLabel('Kind of item').selectOption({ label: 'Choice from a list' });
  await form.getByLabel(/^Name of the new/).fill('Nothing to pick');
  await form.getByRole('button', { name: 'Add choice item' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'at least one option' })).toBeVisible();
  await expect(page.getByText('Nothing to pick')).toHaveCount(0);

  await form.getByLabel('Kind of item').selectOption({ label: 'Date' });
  await form.getByLabel(/^Name of the new/).fill('A day');
  await form.getByRole('button', { name: 'Add date item' }).click();
  await page.getByLabel('Answer for A day').fill('2026-02-03');
  await page.getByRole('button', { name: 'Clear date' }).click();
  await expect(page.getByLabel('Answer for A day')).toHaveValue('');
});

test('axe finds nothing serious in any theme, and it reflows at 320 px (M8-05)', async ({ page }) => {
  await addValueItem(page, { type: 'Number', name: 'A number with a rather long name that must wrap', unit: 'hours' });
  await addValueItem(page, { type: 'Choice from a list', name: 'Good times', options: 'Mornings\nEvenings\nWeekends and some holidays' });
  await page.getByRole('button', { name: 'Edit options for Good times' }).click();
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
