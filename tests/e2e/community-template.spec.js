// M8-07: community template files, driven through the production build (D-074).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, saved, tab } from './fixtures.js';

const live = (page) => page.locator('[role="status"][aria-live="polite"]');
const group = (page) => page.getByRole('group', { name: 'Add a template from a file' });
const make = (over = {}, items) => JSON.stringify({
  templateId: 'my-group', version: 1, title: 'Our group', summary: 'Things our group agreed to ask each other.',
  defaultVisibility: 'hidden', adultIntended: false, isSample: false, statement: 'preferences-not-consent',
  categories: [{ key: 'a', name: 'Ways we talk', sensitivity: 'normal', items: items ?? [
    { key: 'a-1', label: 'A voice message' }, { key: 'a-2', type: 'text', label: 'Best time to reach me' },
  ] }], ...over,
});
const upload = (page, text, name = 'group.json') =>
  group(page).getByLabel('Template file (.json)').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });

test.beforeEach(async ({ page }) => {
  await tab(page, 'Modules');
  await page.getByRole('button', { name: 'Open module library' }).click();
});

test('read the whole file, tick that you read it, then it is added hidden with no answers (D-074)', async ({ page }) => {
  await upload(page, make());
  const preview = page.getByTestId('community-preview');
  await expect(preview).toContainText('Our group');
  await expect(preview).toContainText('2 items');
  await expect(preview).toContainText('1 is a text item');
  await preview.getByText('Ways we talk').click();
  await expect(preview).toContainText('A voice message');
  await expect(preview).toContainText('Best time to reach me (text you write)');

  const add = preview.getByRole('button', { name: 'Add as hidden categories' });
  await expect(add).toBeDisabled();
  await preview.getByLabel('I have read every item above').check();
  await add.click();
  await expect(live(page)).toContainText('all hidden. No answers were added.');
  await expect(page.getByTestId('community-preview')).toHaveCount(0);
  // Hidden: the new category is not in the editor until the person shows it.
  await expect(page.getByRole('heading', { name: 'Ways we talk' })).toHaveCount(0);
  await saved(page);

  await page.reload();
  await tab(page, 'Modules');
  await page.getByRole('button', { name: 'Open module library' }).click();
  await upload(page, make());
  await page.getByTestId('community-preview').getByLabel('I have read every item above').check();
  await page.getByRole('button', { name: 'Add as hidden categories' }).click();
  await expect(live(page)).toContainText('Added 1 category and 2 items');
});

test('a file with a web address, contact details or hidden characters is refused, and nothing is added (D-074)', async ({ page }) => {
  await upload(page, make({}, [{ key: 'a-1', label: 'Join at https://example.com' }]));
  await expect(page.getByTestId('community-problems')).toContainText('contains a web address');
  await expect(page.getByTestId('community-problems')).not.toContainText('example.com');
  await expect(page.getByTestId('community-preview')).toHaveCount(0);

  await upload(page, make({ title: 'Our‮group' }));
  await expect(page.getByTestId('community-problems')).toContainText('invisible or control character');

  await upload(page, 'not json');
  await expect(page.getByTestId('community-problems')).toContainText('not valid JSON');
});

test('a file that carries answers is refused, and an oversized one is not read', async ({ page }) => {
  await upload(page, make({ answers: [{ itemId: 'x', stateId: 'yes' }] }));
  await expect(page.getByTestId('community-problems')).toContainText('unknown fields');
  await upload(page, ' '.repeat(300 * 1024));
  await expect(page.getByTestId('community-problems')).toContainText('larger than 256 KiB');
});

test('axe finds nothing serious in any theme, and it reflows at 320 px', async ({ page }) => {
  await upload(page, make());
  await page.getByTestId('community-preview').getByText('Ways we talk').click();
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
