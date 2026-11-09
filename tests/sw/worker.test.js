// M6-04: the service worker's rules, run against a fake worker scope (D-059).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const body = readFileSync('src/sw/worker.js', 'utf8');

function load({ version = 'v1', precache = ['/', '/index.html', '/assets/app.js'], store = new Map(), network = async () => new Response('net') } = {}) {
  const handlers = {};
  const caches = {
    open: async (name) => ({ addAll: async (list) => { store.set(name, new Set(list)); } }),
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    match: async (req, opts = {}) => {
      const path = typeof req === 'string' ? req : new URL(req.url).pathname;
      const set = store.get(opts.cacheName);
      return set && set.has(path) ? new Response(`kept:${path}`) : undefined;
    },
  };
  const self = {
    location: { origin: 'https://atlas.test' },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}) },
  };
  const fetch = vi.fn(network);
  new Function('self', 'caches', 'fetch', 'VERSION', 'PRECACHE', 'URL', 'Response', 'setTimeout', 'clearTimeout', body)(self, caches, fetch, version, precache, URL, Response, setTimeout, clearTimeout);
  const ask = (url, init = {}) => {
    let answered;
    const request = { url, method: init.method || 'GET', mode: init.mode || 'cors' };
    handlers.fetch({ request, respondWith: (p) => { answered = p; } });
    return answered;
  };
  return { handlers, self, store, fetch, ask };
}

describe('install and activate', () => {
  it('keeps exactly the built files, and does not skip waiting by itself', async () => {
    const w = load();
    let done; w.handlers.install({ waitUntil: (p) => { done = p; } });
    await done;
    expect([...w.store.get('atlas-shell-v1')]).toEqual(['/', '/index.html', '/assets/app.js']);
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('removes only older Atlas caches when a new version takes over', async () => {
    const store = new Map([['atlas-shell-old', new Set()], ['atlas-shell-v2', new Set()], ['other-site', new Set()]]);
    const w = load({ version: 'v2', store });
    let done; w.handlers.activate({ waitUntil: (p) => { done = p; } });
    await done;
    expect([...store.keys()].sort()).toEqual(['atlas-shell-v2', 'other-site']);
    expect(w.self.clients.claim).toHaveBeenCalled();
  });

  it('skips waiting only when the page asks', () => {
    const w = load();
    w.handlers.message({ data: { type: 'nothing' } });
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(w.self.skipWaiting).toHaveBeenCalledOnce();
  });
});

describe('what it answers', () => {
  const ready = async (opts) => { const w = load(opts); let d; w.handlers.install({ waitUntil: (p) => { d = p; } }); await d; return w; };

  it('ignores other origins, non-GET requests, its own file and unknown paths', async () => {
    const w = await ready();
    expect(w.ask('https://elsewhere.test/assets/app.js')).toBeUndefined();
    expect(w.ask('https://atlas.test/assets/app.js', { method: 'POST' })).toBeUndefined();
    expect(w.ask('https://atlas.test/sw.js')).toBeUndefined();
    expect(w.ask('https://atlas.test/something-else.json')).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('serves built files from the kept copy without touching the network', async () => {
    const w = await ready();
    const res = await w.ask('https://atlas.test/assets/app.js');
    expect(await res.text()).toBe('kept:/assets/app.js');
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('opens pages from the network when online', async () => {
    const w = await ready();
    const res = await w.ask('https://atlas.test/', { mode: 'navigate' });
    expect(await res.text()).toBe('net');
  });

  it('opens pages from the kept copy when offline', async () => {
    const w = await ready({ network: async () => { throw new TypeError('offline'); } });
    const res = await w.ask('https://atlas.test/', { mode: 'navigate' });
    expect(await res.text()).toBe('kept:/index.html');
  });

  it('opens pages from the kept copy when the network errors (a bad answer is not shown)', async () => {
    const w = await ready({ network: async () => new Response('nope', { status: 502 }) });
    const res = await w.ask('https://atlas.test/', { mode: 'navigate' });
    expect(await res.text()).toBe('kept:/index.html');
  });

  it('never stores anything it fetches', async () => {
    const w = await ready({ precache: ['/', '/index.html'] });
    const before = JSON.stringify([...w.store.get('atlas-shell-v1')]);
    await w.ask('https://atlas.test/', { mode: 'navigate' });
    expect(JSON.stringify([...w.store.get('atlas-shell-v1')])).toBe(before);
  });
});

describe('the worker text', () => {
  it('names no other origin, no storage API and no data', () => {
    const code = body.replace(/\/\/.*$/gm, ''); // comments may name these things; code may not
    expect(code).not.toMatch(/https?:\/\//);
    expect(code).not.toMatch(/indexedDB|localStorage|sessionStorage/i);
    expect(code).not.toMatch(/cache\.put|\.add\(/);
  });
});
