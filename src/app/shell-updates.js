// Registers the offline app shell and tells the page when a newer version is waiting (M6-04, D-059).
// Nothing here reads or writes profile data. A page that cannot register (private window, old browser,
// plain http) just carries on without offline use.
import { useSyncExternalStore } from 'react';

let waiting = null; // the waiting ServiceWorker, once there is one
const listeners = new Set();
const set = (worker) => { waiting = worker; listeners.forEach((l) => l()); };

/** @param {{ serviceWorker?: any }} nav  @param {string} [url] */
export async function registerShell(nav = navigator, url = '/sw.js') {
  const container = nav.serviceWorker;
  if (!container) return { ok: false, reason: 'unsupported' };
  let registration;
  try {
    registration = await container.register(url);
  } catch {
    return { ok: false, reason: 'refused' };
  }
  // Only a replacement counts as an update: the first install has no controller yet.
  const announce = (worker) => { if (worker && container.controller) set(worker); };
  announce(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') announce(worker); });
  });
  return { ok: true };
}

/** Ask the waiting version to take over; the page reloads when it has. */
export function applyUpdate(nav = navigator, reload = () => window.location.reload()) {
  if (!waiting) return;
  nav.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function useUpdateReady() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => waiting !== null,
  );
}

export function resetShellUpdatesForTests() { waiting = null; listeners.clear(); }
