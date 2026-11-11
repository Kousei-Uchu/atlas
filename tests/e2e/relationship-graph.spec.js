// M7-06: the relationship graph, driven through the production build (D-066).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, saved } from './fixtures.js';

const panel = (page) => page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Relationship graph' }) });
const live = (page) => page.locator('[role="status"][aria-live="polite"]');

async function addAudience(page, name, kind) {
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill(name);
  await page.getByLabel('Kind of audience').selectOption({ label: kind });
  await page.getByRole('button', { name: 'Add audience' }).click();
  await page.getByRole('button', { name: /^Close audiences/ }).click();
}

test('without audiences the panel says where to make one', async ({ page }) => {
  await page.getByRole('button', { name: 'Open relationship graph' }).click();
  await expect(panel(page)).toContainText('Add one in the Audiences panel');
});

test('place one audience inside another, in the list, and the picture is hidden from assistive technology (M7-06)', async ({ page }) => {
  await addAudience(page, 'Friends', 'Friends');
  await addAudience(page, 'Close ones', 'Close friends');
  await page.getByRole('button', { name: 'Open relationship graph' }).click();
  const list = panel(page).getByRole('list', { name: 'Audiences, with you at the top' });
  await expect(list).toContainText('Friends');
  await expect(list).toContainText('Close ones');
  await expect(list).toContainText('nothing set for this audience');
  await expect(panel(page).locator('svg.rg-svg')).toHaveAttribute('aria-hidden', 'true');

  const select = panel(page).getByLabel('Place Close ones inside');
  // an audience is never offered itself
  await expect(select.locator('option', { hasText: 'Close ones' })).toHaveCount(0);
  await select.selectOption({ label: 'Friends' });
  await expect(live(page)).toContainText('Close ones is inside Friends');
  await expect(list.locator('[data-depth="1"]')).toContainText('Close ones');
  await expect(list.locator('[data-depth="1"]')).toContainText('inside the audience above');

  // a parent cannot be placed inside its own child
  await expect(panel(page).getByLabel('Place Friends inside').locator('option', { hasText: 'Close ones' })).toHaveCount(0);

  await select.selectOption({ label: 'Me (top level)' });
  await expect(list.locator('[data-depth="1"]')).toHaveCount(0);
  await expect(panel(page)).not.toContainText(/score|closeness|strength|trust level|rank/i);
  await saved(page);
});

test('axe finds nothing serious in any theme, and it reflows at 320 px', async ({ page }) => {
  await addAudience(page, 'Friends', 'Friends');
  await addAudience(page, 'A very long audience name that has to wrap on a small screen', 'Family');
  await page.getByRole('button', { name: 'Open relationship graph' }).click();
  await panel(page).getByLabel(/^Place A very long audience name/).selectOption({ label: 'Friends' });
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
