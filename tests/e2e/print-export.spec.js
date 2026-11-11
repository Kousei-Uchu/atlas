// M8-02: print or save as PDF, from the export model only (D-069). Real printing is the browser's; here the
// print call is replaced so the page can be checked as it would print.
import { test, expect, stateButton, HUG } from './fixtures.js';

async function makeView(page) {
  await page.getByRole('button', { name: /^Open audiences/ }).click();
  await page.getByLabel('Name of the audience').fill('Friends');
  await page.getByLabel('Kind of audience').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Add audience' }).click();
  await page.getByRole('button', { name: 'Open views' }).click();
  await page.getByLabel('Name of the view').fill('For my friends');
  await page.getByLabel('Who it is for').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: 'Make view' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => { window.__prints = 0; window.print = () => { window.__prints += 1; }; });
});

test('print is off until the view includes something, then prints only the held-back-free page (M8-02)', async ({ page }) => {
  await stateButton(page, HUG).click();
  await makeView(page);
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeDisabled();
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();
  await expect(page.getByTestId('print-sheet')).toHaveCount(0);

  await page.getByRole('button', { name: 'Print or save as PDF' }).click();
  expect(await page.evaluate(() => window.__prints)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-print'))).toBe('export');

  const sheet = page.getByTestId('print-sheet');
  await expect(sheet).toBeHidden();                       // not on screen
  const text = await sheet.textContent();
  expect(text).toContain('For my friends');
  expect(text).toContain(HUG);
  expect(text).toContain('Unsure');
  expect(text).toMatch(/not consent|preferences/i);
  expect(text.match(/preferences/gi).length).toBeGreaterThanOrEqual(2);   // statement at both ends
  // The chart has other items; the view does not include them, so they are not on the page.
  expect(text).not.toContain('Sample: Communication');

  await page.emulateMedia({ media: 'print' });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Views', exact: true })).toBeHidden();
  const pdf = await page.pdf({ format: 'A4' });          // Chromium's own PDF of the print layout
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);   // one short page, not the whole app
  await page.emulateMedia({ media: 'screen' });

  // The dialog closing takes the page away again.
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-print'))).toBeNull();
});

test('the printable page can be made again and again (M8-02)', async ({ page }) => {
  await stateButton(page, HUG).click();
  await makeView(page);
  await page.getByRole('checkbox', { name: new RegExp(`^${HUG}`) }).check();
  for (let n = 1; n <= 2; n += 1) {
    await page.getByRole('button', { name: 'Print or save as PDF' }).click();
    expect(await page.evaluate(() => window.__prints)).toBe(n);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.getByTestId('print-sheet')).toHaveCount(0);
  }
});
