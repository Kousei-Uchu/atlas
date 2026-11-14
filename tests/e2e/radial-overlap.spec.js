// M7-07: the radial diagram and the overlap of two audiences, through the production build (D-067).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, tab } from './fixtures.js';

const panel = (page) => page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Radial diagram and overlaps' }) });

async function addAudience(page, name, kind) {
  await tab(page, 'Share');
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill(name);
  await page.getByLabel('Kind of audience').selectOption({ label: kind });
  await page.getByRole('button', { name: 'Add audience' }).click();
  await page.getByRole('button', { name: /^Close audiences/ }).click();
}

test('the radial diagram is a list first, and the drawing is hidden from assistive technology (M7-07)', async ({ page }) => {
  await stateButton(page, HUG).click();   // Unsure
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open radial diagram and overlaps' }).click();
  const list = panel(page).getByRole('list', { name: 'Groups, in the order of the diagram' });
  await expect(list).toContainText('Unsure 1');
  await expect(list).toContainText('unanswered');
  await expect(panel(page).locator('svg.rd-svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(panel(page)).not.toContainText(/score|average|percent|overall/i);
  await expect(panel(page)).toContainText('To see an overlap, make two audiences');
});

test('two audiences: answered for both, or for one only, in words (M7-07)', async ({ page }) => {
  await stateButton(page, HUG).click();
  await addAudience(page, 'Friends', 'Friends');
  await addAudience(page, 'Family', 'Family');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open radial diagram and overlaps' }).click();
  await panel(page).getByLabel('First audience').selectOption({ label: 'Friends' });
  await panel(page).getByLabel('Second audience').selectOption({ label: 'Friends' });
  await expect(panel(page)).toContainText('Choose two different audiences');
  await panel(page).getByLabel('Second audience').selectOption({ label: 'Family' });
  const words = panel(page).getByRole('list', { name: 'Overlap in words' });
  await expect(words).toContainText('Answered for both: 1 (1 with the same answer, 0 with different answers)');
  await expect(words).toContainText('Answered for Friends only: 0');
  await expect(panel(page).getByRole('heading', { name: 'Same answer for both (1)' })).toBeVisible();
  await expect(panel(page).locator('svg.ov-svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(panel(page)).not.toContainText(/similar|compatible|percent|\d+%/i);
});

test('axe finds nothing serious in any theme, and it reflows at 320 px', async ({ page }) => {
  await stateButton(page, HUG).click();
  await addAudience(page, 'Friends', 'Friends');
  await addAudience(page, 'A very long audience name that has to wrap on a small screen', 'Family');
  await tab(page, 'Explore');
  await page.getByRole('button', { name: 'Open radial diagram and overlaps' }).click();
  await panel(page).getByLabel('First audience').selectOption({ label: 'Friends' });
  await panel(page).getByLabel('Second audience').selectOption({ index: 2 });
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
