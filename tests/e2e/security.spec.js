import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

test('production HTML carries a CSP that forbids all connections (M1-AC-10)', async ({ page }) => {
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("script-src 'self'");
});

test('the browser itself blocks a request to another origin', async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    try { await fetch('https://example.com/', { mode: 'no-cors' }); return 'sent'; } catch { return 'blocked'; }
  });
  expect(outcome).toBe('blocked');
});

test('uses the app without making any request to another origin (I-06)', async ({ page }) => {
  await stateButton(page, HUG).click();
  await saved(page);
  await page.reload();
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
  // The fixture fails the test if any request left the app's own origin.
});

test('axe finds no serious or critical violations, including colour contrast (M1-AC-05)', async ({ page }) => {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${scheme}: ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
  }
});

test('no console output reaches the page console', async ({ page }) => {
  const messages = [];
  page.on('console', (m) => messages.push(m.text()));
  await stateButton(page, HUG).click();
  await saved(page);
  expect(messages.filter((t) => !/Download the React DevTools/.test(t))).toEqual([]);
});
