// M6-04: the app opens with no connection, keeps the person's data, and never caches it (D-059).
import http from 'node:http';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

async function waitForWorker(page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true).catch(async () => {
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  });
}

test('after one visit the app opens offline and the saved chart is still there', async ({ page, context }) => {
  await waitForWorker(page);
  await stateButton(page, HUG).click();
  await saved(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(stateButton(page, HUG)).toHaveText('Unsure'); // the first click's state came back from storage
  await context.setOffline(false);
});

test('the kept files are only the built app, never profile data', async ({ page }) => {
  await waitForWorker(page);
  await stateButton(page, HUG).click();
  await saved(page);
  const kept = await page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });
  const names = Object.keys(kept);
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^atlas-shell-[0-9a-f]{12}$/);
  for (const path of kept[names[0]]) expect(path).toMatch(/^\/($|index\.html$|assets\/)/);
});

test('deleting all local data leaves the shell, and the app still opens clean offline', async ({ page, context }) => {
  await waitForWorker(page);
  await stateButton(page, HUG).click();
  await saved(page);
  await page.getByRole('button', { name: 'Delete all local data' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete everything' }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test('a share link opens offline too, because nothing is fetched for it', async ({ page, context }) => {
  await waitForWorker(page);
  await context.setOffline(true);
  await page.goto('/?again=1#atlas=1.not-a-real-link'); // a real navigation, not just a new hash
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test('a newer version waits for the person, keeps their data, then takes over on Reload now (D-059)', async ({ browser, baseURL }) => {
  // A small local proxy in front of the built app, so the worker file can change between visits like a new deploy.
  let swVersion = null;
  const server = http.createServer(async (req, res) => {
    const upstream = await fetch(new URL(req.url, baseURL));
    let body = Buffer.from(await upstream.arrayBuffer());
    if (req.url === '/sw.js' && swVersion) body = Buffer.from(body.toString('utf8').replace(/const VERSION = "[0-9a-f]+"/, `const VERSION = "${swVersion}"`));
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'text/plain', 'cache-control': 'no-cache' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://localhost:${server.address().port}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(origin);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await waitForWorker(page);
    await stateButton(page, HUG).click();
    await saved(page);
    const oldName = (await page.evaluate(() => caches.keys()))[0];

    swVersion = 'feedfacefeed'; // "deploy" a new version
    await page.evaluate(async () => { (await navigator.serviceWorker.getRegistration()).update(); });

    await expect(page.getByTestId('update-ready')).toBeVisible();
    await expect(page.getByTestId('update-ready')).toContainText('Your chart is saved');
    // Nothing has changed under the person: still the old shell, and their answer is intact.
    expect(await page.evaluate(() => caches.keys())).toContain(oldName);
    await expect(stateButton(page, HUG)).toHaveText('Unsure');

    await page.getByRole('button', { name: 'Reload now' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => caches.keys()).catch(() => null)).toEqual(['atlas-shell-feedfacefeed']); // the page may be mid-reload
    await expect(stateButton(page, HUG)).toHaveText('Unsure');
    await expect(page.getByTestId('update-ready')).toHaveCount(0);
  } finally {
    await context.close();
    server.close();
  }
});
