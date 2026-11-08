import AxeBuilder from '@axe-core/playwright';
import { test, expect, stateButton, saved } from './fixtures.js';

const card = (page, title) => page.locator('.module').filter({ has: page.getByRole('heading', { name: title }) });
const category = (page, name) => page.locator('.category-header h2', { hasText: name });
const dialog = (page) => page.getByRole('alertdialog');

async function addAdultModule(page, title) {
  await card(page, title).getByRole('button', { name: `Add ${title}` }).click();
  await dialog(page).getByRole('button', { name: 'Turn on module' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.getByRole('button', { name: 'Open module library' }).click();
});

test('mature phrasing rewords the adult modules, keeps answers, survives a reload and can be undone (D-043)', async ({ page }) => {
  await addAdultModule(page, 'Intimacy boundaries');
  await expect(category(page, 'Kinds of intimate activity')).toBeVisible();
  await expect(category(page, 'Kinds of sexual activity')).toHaveCount(0);
  await expect(page.getByText('Giving oral sex to a partner')).toHaveCount(0);

  // Answer something in the protection section first, to prove answers are kept.
  await stateButton(page, 'Using a condom').click();
  const answered = await stateButton(page, 'Using a condom').innerText();
  expect(answered).not.toBe('Unanswered');

  // The note comes first, and cancelling changes nothing.
  await page.getByLabel('Mature phrasing').click();
  await expect(dialog(page)).toContainText('direct words for bodies and for sexual activity');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('General wording')).toBeChecked();
  await expect(category(page, 'Kinds of intimate activity')).toBeVisible();

  // Accepting rewords the chart.
  await page.getByLabel('Mature phrasing').click();
  await dialog(page).getByRole('button', { name: 'Turn on mature phrasing' }).click();
  await expect(category(page, 'Kinds of sexual activity')).toBeVisible();
  await expect(category(page, 'Kinds of intimate activity')).toHaveCount(0);
  await expect(page.getByText('Giving oral sex to a partner', { exact: true })).toBeVisible();
  await expect(page.getByText('Vaginal intercourse, with a partner’s penis inside me', { exact: true })).toBeVisible();
  await expect(stateButton(page, 'Using a condom')).toHaveText(answered);
  await saved(page);

  // It is saved with the profile.
  await page.reload();
  await expect(category(page, 'Kinds of sexual activity')).toBeVisible();
  await page.getByRole('button', { name: 'Open module library' }).click();
  await expect(page.getByLabel('Mature phrasing')).toBeChecked();

  // Going back needs no note, and one Undo reverses a switch.
  await page.getByLabel('General wording').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(category(page, 'Kinds of intimate activity')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(category(page, 'Kinds of sexual activity')).toBeVisible();
  await expect(page.getByLabel('Mature phrasing')).toBeChecked();
});

test('the anatomy module has biological sex and private parts sections, in general or direct wording (D-043)', async ({ page }) => {
  await addAdultModule(page, 'Anatomy and compatibility');
  await expect(category(page, 'Biological sex and body characteristics')).toBeVisible();
  await expect(category(page, 'Private parts: touch')).toBeVisible();
  await expect(page.getByText('Touch that goes inside my front passage', { exact: true })).toBeVisible();
  await expect(page.getByText('Touch that goes inside my vagina')).toHaveCount(0);

  await page.getByLabel('Mature phrasing').click();
  await dialog(page).getByRole('button', { name: 'Turn on mature phrasing' }).click();
  await expect(category(page, 'Genitals and nearby parts: touch')).toBeVisible();
  await expect(category(page, 'Biological sex and body characteristics')).toBeVisible();
  await expect(page.getByText('Touch that goes inside my vagina', { exact: true })).toBeVisible();
  await expect(page.getByText('Touch that goes inside my front passage')).toHaveCount(0);
});
