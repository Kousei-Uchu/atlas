import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, stateButton, saved, HUG } from './fixtures.js';

async function makeView(page, name = 'For my friends') {
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill('Friends');
  await page.getByLabel('Kind of audience').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Add audience' }).click();
  await page.getByRole('button', { name: 'Open views' }).click();
  await page.getByLabel('Name of the view').fill(name);
  await page.getByLabel('Who it is for').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Make view' }).click();
}
const download = async (page, buttonName) => {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: buttonName }).click()]);
  return file;
};

test('build a view, see what is held back, and download Markdown, SVG and PNG (M4-05, M4-06)', async ({ page }) => {
  await stateButton(page, HUG).click();
  await makeView(page);
  const review = page.getByTestId('review');
  await expect(page.getByTestId('review-counts')).toContainText('0 items included');

  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();
  await expect(page.getByTestId('review-counts')).toContainText('1 item included, 0 items held back');
  await expect(review).toContainText(HUG);

  const md = await download(page, 'Download Markdown');
  expect(md.suggestedFilename()).toMatch(/^atlas-for-my-friends-\d{4}-\d{2}-\d{2}\.md$/);
  const text = fs.readFileSync(await md.path(), 'utf8');
  expect(text).toContain(HUG);
  expect(text).toMatch(/not consent|preferences/i);

  const svg = await download(page, 'Download SVG picture');
  expect(svg.suggestedFilename()).toMatch(/\.svg$/);
  const svgText = fs.readFileSync(await svg.path(), 'utf8');
  expect(svgText.startsWith('<svg')).toBe(true);
  expect(svgText).toContain(HUG);
  expect(svgText).not.toMatch(/<script|<image|<foreignObject/i);

  const png = await download(page, 'Download PNG picture');
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  const bytes = fs.readFileSync(await png.path());
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

  await saved(page);
  await page.reload();
  await page.getByRole('button', { name: 'Open views' }).click();
  await expect(page.getByRole('listitem', { name: 'For my friends' })).toContainText('1 item included');
});

test('held-back items stay out of every download until chosen on their own (I-11)', async ({ page }) => {
  await page.getByRole('button', { name: 'Open module library' }).click();
  for (const title of ['Intimacy boundaries', 'Physical contact']) {
    const card = page.locator('.module').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await card.getByRole('button', { name: `Add ${title}` }).click();
    const dialog = page.getByRole('alertdialog');
    if (await dialog.count()) await dialog.getByRole('button', { name: 'Turn on module' }).click();
  }
  await makeView(page);
  // Pick everything in the first category that holds a sensitive or restricted item.
  const restricted = page.getByRole('checkbox', { name: /\(restricted\)/ }).first();
  const sensitive = page.getByRole('checkbox', { name: /\(sensitive\)/ }).first();
  const restrictedLabel = (await restricted.locator('xpath=ancestor::label').innerText()).replace(/\s*\(restricted\)\s*$/, '').trim();
  const sensitiveLabel = (await sensitive.locator('xpath=ancestor::label').innerText()).replace(/\s*\(sensitive\)\s*$/, '').trim();
  await restricted.check();
  await sensitive.check();
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();

  await expect(page.getByTestId('review')).toContainText('Held back: it is restricted');
  await expect(page.getByTestId('review')).toContainText('Held back: it is sensitive');

  const text = fs.readFileSync(await (await download(page, 'Download Markdown')).path(), 'utf8');
  expect(text).toContain(HUG);
  expect(text).not.toContain(restrictedLabel);
  expect(text).not.toContain(sensitiveLabel);

  // The sensitive switch lets sensitive items through but never restricted ones.
  await page.getByRole('checkbox', { name: /^Include sensitive items/ }).check();
  const second = fs.readFileSync(await (await download(page, 'Download Markdown')).path(), 'utf8');
  expect(second).toContain(sensitiveLabel);
  expect(second).not.toContain(restrictedLabel);

  await page.getByRole('checkbox', { name: new RegExp(`^Include ${restrictedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} in this view`) }).check();
  const third = fs.readFileSync(await (await download(page, 'Download Markdown')).path(), 'utf8');
  expect(third).toContain(restrictedLabel);
});

test('the views screen has no serious accessibility violations in any theme (M4-05)', async ({ page }) => {
  await makeView(page);
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();
  await page.getByRole('button', { name: 'Show Markdown preview' }).click();
  for (const theme of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label: theme });
    const results = await new AxeBuilder({ page }).include('.view-builder').analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id);
    expect(serious, theme).toEqual([]);
  }
});

test('download a CSV that holds only what the view includes (M8-01)', async ({ page }) => {
  await stateButton(page, HUG).click();
  await makeView(page);
  await expect(page.getByRole('button', { name: 'Download CSV spreadsheet' })).toBeDisabled();
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();
  const csv = await download(page, 'Download CSV spreadsheet');
  expect(csv.suggestedFilename()).toMatch(/^atlas-for-my-friends-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = fs.readFileSync(await csv.path(), 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain('"Group","Item","Answer"');
  expect(text).toContain(`"${HUG}","Unsure"`);
  expect(text).toMatch(/not consent|preferences/i);
  // The chart has more items than the view includes; none of them is in the file.
  expect(text.split('\r\n').filter((l) => l.startsWith('"Sample:')).length).toBe(1);
  await expect(page.locator('[role="status"][aria-live="polite"]')).toContainText('Downloaded For my friends as CSV');
});

test('download a web page that holds only what the view includes, and opens with no script or request (M8-03)', async ({ page, context }) => {
  await stateButton(page, HUG).click();
  await makeView(page);
  await expect(page.getByRole('button', { name: 'Download web page (HTML)' })).toBeDisabled();
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();
  const file = await download(page, 'Download web page (HTML)');
  expect(file.suggestedFilename()).toMatch(/^atlas-for-my-friends-\d{4}-\d{2}-\d{2}\.html$/);
  const html = fs.readFileSync(await file.path(), 'utf8');
  expect(html).toContain(HUG);
  expect(html).not.toContain('Sample: Communication');
  expect(html).not.toMatch(/<script|<img|<link|<a[\s>]/i);

  // Open the saved file as a stranger would: no console policy violations, and it shows the content.
  const opened = await context.newPage();
  const problems = [];
  opened.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  const requests = [];
  opened.on('request', (r) => { if (!r.url().startsWith('data:') && !r.url().startsWith('about:')) requests.push(r.url()); });
  await opened.setContent(html);
  await expect(opened.getByRole('heading', { name: 'For my friends' })).toBeVisible();
  await expect(opened.getByText(HUG)).toBeVisible();
  expect(problems).toEqual([]);
  expect(requests).toEqual([]);
  const found = (await new AxeBuilder({ page: opened }).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(found.map((v) => v.id)).toEqual([]);
  await expect(page.locator('[role="status"][aria-live="polite"]')).toContainText('Downloaded For my friends as HTML');
});
