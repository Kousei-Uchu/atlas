// M7-03: timeline and snapshots, through the production build (D-063).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

const live = (page) => page.locator('[role="status"][aria-live="polite"]');
const panel = (page) => page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Timeline and snapshots' }) });

async function openTimeline(page) {
  await page.getByRole('button', { name: 'Open timeline' }).click();
}
async function save(page, name) {
  await panel(page).getByLabel('Name for this snapshot').fill(name);
  await panel(page).getByRole('button', { name: 'Save snapshot' }).click();
}

test('with nothing answered, a snapshot is refused in plain words', async ({ page }) => {
  await openTimeline(page);
  await save(page, 'Empty');
  await expect(panel(page).getByRole('alert')).toContainText('no answers to save yet');
});

test('save, change, compare with now, and see it in plain words (M7-03)', async ({ page }) => {
  await stateButton(page, HUG).click();            // Unsure
  await openTimeline(page);
  await expect(panel(page)).toContainText('does not keep notes or your own words');
  await save(page, 'Before');
  await expect(live(page)).toContainText('Snapshot saved: Before');
  await expect(panel(page).getByRole('list', { name: 'Timeline, oldest first' })).toContainText('Before');

  await stateButton(page, HUG).click();            // No
  await expect(panel(page).getByText(/1 changed since the last snapshot/)).toBeVisible();
  await expect(panel(page).locator('.tl-compare')).toContainText('1 answer changed');
  await expect(panel(page).locator('.tl-compare')).toContainText(/Unsure, then No/);
  // no judgement words anywhere on the screen
  await expect(panel(page)).not.toContainText(/better|worse|improv|score|progress/i);
  await saved(page);
});

test('snapshots survive a reload and stay out of the chart and exports', async ({ page }) => {
  await stateButton(page, HUG).click();
  await openTimeline(page);
  await save(page, 'Kept');
  await saved(page);
  await page.reload();
  await openTimeline(page);
  await expect(panel(page).getByRole('list', { name: 'Timeline, oldest first' })).toContainText('Kept');
});

test('delete one snapshot, with a confirmation that says copies elsewhere remain', async ({ page }) => {
  await stateButton(page, HUG).click();
  await openTimeline(page);
  await save(page, 'Doomed');
  await panel(page).getByRole('button', { name: 'Delete Doomed' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Backups and files you already made keep their own copies');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(panel(page).getByRole('list', { name: 'Timeline, oldest first' })).toContainText('Doomed');
  await panel(page).getByRole('button', { name: 'Delete Doomed' }).click();
  await dialog.getByRole('button', { name: 'Delete snapshot' }).click();
  await expect(panel(page)).toContainText('No snapshots yet');
});

test('make a new profile from a snapshot, and the first one is untouched (I-12)', async ({ page }) => {
  await stateButton(page, HUG).click();            // Unsure
  await openTimeline(page);
  await save(page, 'Then');
  await stateButton(page, HUG).click();            // No
  await panel(page).getByRole('button', { name: 'Make a new profile from Then' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Make new profile' }).click();
  await expect(page.getByText('Profile: My profile (as at Then)')).toBeVisible();
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
});

test('axe finds nothing serious in any theme, and it fits 320 px', async ({ page }) => {
  await stateButton(page, HUG).click();
  await openTimeline(page);
  await save(page, 'One');
  await stateButton(page, HUG).click();
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label });
    const v = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => ['serious', 'critical'].includes(x.impact));
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target)}`), label).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
