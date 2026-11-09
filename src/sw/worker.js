/* global VERSION, PRECACHE */
// The service worker body (M6-04, D-059). The build puts `const VERSION` and `const PRECACHE` in front of
// this text and writes the result to dist/sw.js (scripts/make-sw.mjs). It is kept as plain text so a test
// can run it against a fake `self` and `caches`.
//
// What it does: keeps the app's own files so the app opens with no connection.
// What it never does: store or send profile data, fetch another origin, or cache anything it was not
// told about at build time. Profile data lives in IndexedDB, which this file never touches.

const CACHE_PREFIX = 'atlas-shell-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const NAVIGATION_WAIT_MS = 4000;

self.addEventListener('install', (event) => {
  // No skipWaiting here: a new version waits until the person chooses to reload, so a page that is
  // being edited is never swapped under them.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('slow')), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

/** Pages: the network first, so an online visit always gets the newest app; the kept copy when offline or slow. */
async function answerNavigation(request) {
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_WAIT_MS);
    if (response && response.ok) return response;
  } catch { /* offline or slow: use the kept copy */ }
  const kept = await caches.match('/index.html', { cacheName: CACHE_NAME, ignoreVary: true });
  return kept || fetch(request);
}

/** Built files: the kept copy first. Anything not kept goes to the network and is not stored. */
async function answerAsset(request) {
  const kept = await caches.match(request, { cacheName: CACHE_NAME, ignoreVary: true });
  return kept || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') { event.respondWith(answerNavigation(request)); return; }
  if (PRECACHE.includes(url.pathname)) event.respondWith(answerAsset(request));
});
