// Reading and writing the share fragment, `#atlas=<version>.<payload>` (D-017; M5-01).
// Pure string functions, so they are tested without a browser. The fragment is never sent to a
// server by the browser, and the app has no hash routing, so nothing else claims it.
import { SHARE_VERSION } from './codec.js';

const KEY = 'atlas=';

/**
 * @param {string} hash  `location.hash`, with or without the leading #.
 * @returns {{ kind: 'none' } | { kind: 'share', version: string, payload: string } | { kind: 'broken' }}
 */
export function readFragment(hash) {
  const text = String(hash ?? '').replace(/^#/, '');
  if (!text.startsWith(KEY)) return { kind: 'none' };
  const body = text.slice(KEY.length);
  const dot = body.indexOf('.');
  if (dot <= 0 || dot === body.length - 1) return { kind: 'broken' };
  return { kind: 'share', version: body.slice(0, dot), payload: body.slice(dot + 1) };
}

/** Whether this app can read that version. */
export const isSupportedVersion = (version) => version === SHARE_VERSION;

/** The full link: the page's own address (no query or old fragment) plus the fragment. */
export function buildShareUrl(pageUrl, payload) {
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = `${KEY}${SHARE_VERSION}.${payload}`;
  return url.toString();
}
