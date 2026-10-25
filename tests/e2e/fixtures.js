import { test as base, expect } from '@playwright/test';

export const HUG = 'A hug from a friend';

/**
 * Every test gets a fresh browser context, so IndexedDB starts empty. Requests to any
 * origin other than the app's own are recorded so tests can assert there were none (I-06).
 */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const external = [];
    const origin = new URL(baseURL).origin;
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return;
      if (new URL(url).origin !== origin) external.push(url);
    });
    page.external = external;
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await use(page);
    expect(external, 'requests to other origins').toEqual([]);
  },
});

export { expect };

/** The state button for an item. */
export const stateButton = (page, label) => page.getByRole('button', { name: new RegExp(`^${label}:`) });

/** Wait until autosave has committed. */
export const saved = (page) => expect(page.locator('.save-status')).toHaveText('Saved');
