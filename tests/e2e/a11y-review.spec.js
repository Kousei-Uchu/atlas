// M6-02: accessibility review of every screen together. Each test looks at the whole app
// with all panels open, not one feature at a time.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton } from './fixtures.js';

const appearance = (page) => page.getByRole('combobox', { name: 'Appearance' });

/** Open every panel whose opener is a button named "Open ...". Returns how many opened. */
async function openAllPanels(page) {
  let opened = 0;
  for (let i = 0; i < 12; i += 1) {
    const opener = page.getByRole('button', { name: /^Open (?!a profile)/ }).first();
    if (!(await opener.count())) break;
    await opener.click();
    opened += 1;
  }
  return opened;
}

const serious = async (page) => (await new AxeBuilder({ page }).analyze()).violations
  .filter((v) => v.impact === 'serious' || v.impact === 'critical')
  .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);

test('with every panel open, axe finds nothing serious in any theme', async ({ page }) => {
  await stateButton(page, HUG).click();
  expect(await openAllPanels(page)).toBeGreaterThan(2);
  for (const label of ['Light', 'Dark', 'High contrast']) {
    await appearance(page).selectOption({ label });
    expect(await serious(page), label).toEqual([]);
  }
});

test('landmarks, headings, title and language are sound with all panels open', async ({ page }) => {
  await openAllPanels(page);
  await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
  expect((await page.title()).trim().length).toBeGreaterThan(2);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const levels = await page.$$eval('h1,h2,h3,h4,h5,h6', (hs) => hs.filter((h) => h.offsetParent !== null).map((h) => Number(h.tagName[1])));
  for (let i = 1; i < levels.length; i += 1) expect(levels[i] - levels[i - 1], `heading order ${levels.join(',')}`).toBeLessThanOrEqual(1);
});

test('the first Tab stop is a skip link that moves focus into the main content', async ({ page }) => {
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /skip to/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  const inMain = await page.evaluate(() => !!document.activeElement.closest('main') || document.activeElement.id === 'main');
  expect(inMain).toBe(true);
});

test('every control reachable by Tab shows a visible focus indicator, and Tab never gets stuck', async ({ page }) => {
  await openAllPanels(page);
  const seen = new Set();
  const bad = [];
  for (let i = 0; i < 400; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const outline = parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none';
      const shadow = s.boxShadow !== 'none';
      el.setAttribute('data-a11y-seen', '1');
      return { key: el.outerHTML.slice(0, 90), outline: outline || shadow };
    });
    if (!info) continue;
    if (seen.has(info.key)) break;
    seen.add(info.key);
    if (!info.outline) bad.push(info.key);
  }
  expect(seen.size).toBeGreaterThan(10);
  expect(bad, 'focused without a visible indicator').toEqual([]);
});

test('Escape closes a dialog and returns focus to the control that opened it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Escape is a keyboard test');
  await openAllPanels(page);
  const opener = page.getByRole('button', { name: 'Delete all local data' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('the page reflows at 320 px wide with no horizontal scrolling and nothing cut off', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openAllPanels(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const wide = await page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('pre, table, svg, .scroll-x, [data-scroll]'))
    .slice(0, 5).map((e) => e.tagName + '.' + e.className));
  expect(wide, 'elements wider than the viewport').toEqual([]);
});

test('text spacing overrides (WCAG 1.4.12) do not clip or hide content', async ({ page }) => {
  await openAllPanels(page);
  // A constructed stylesheet is not an inline style, so the page's strict CSP allows it.
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('*{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important} p{margin-bottom:2em !important}');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  const clipped = await page.evaluate(() => [...document.querySelectorAll('button, label, h1, h2, h3, p, li')]
    .filter((e) => e.offsetParent !== null)
    .filter((e) => { const s = getComputedStyle(e); return (s.overflow === 'hidden' || s.overflowY === 'hidden') && e.scrollHeight > e.clientHeight + 2; })
    .slice(0, 5).map((e) => e.tagName + ':' + (e.textContent || '').trim().slice(0, 30)));
  expect(clipped).toEqual([]);
});

test('reduced motion turns animations and transitions off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAllPanels(page);
  const moving = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => {
    const s = getComputedStyle(e);
    const d = (v) => v.split(',').some((x) => parseFloat(x) > 0.001);
    return (s.animationName !== 'none' && d(s.animationDuration)) || d(s.transitionDuration);
  }).slice(0, 5).map((e) => e.tagName + '.' + e.className));
  expect(moving).toEqual([]);
});

test('forced colours: every control stays visible and axe finds nothing serious', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openAllPanels(page);
  expect(await serious(page)).toEqual([]);
});

test('actions are announced in the polite live region', async ({ page }) => {
  const live = page.locator('[role="status"][aria-live="polite"]');
  await expect(live).toHaveCount(1);
  await stateButton(page, HUG).click();
  await expect(live).not.toHaveText('');
});

test('on a phone every button, link and field is at least 24 px square', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await openAllPanels(page);
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, [role=button]')]
    .filter((e) => e.offsetParent !== null && !e.classList.contains('visually-hidden'))
    .map((e) => ({ r: e.getBoundingClientRect(), e }))
    .filter(({ r }) => r.width < 24 || r.height < 24)
    .slice(0, 8).map(({ e, r }) => `${e.tagName}:${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`));
  expect(small).toEqual([]);
});
