// Single source of truth for response security headers (spec 4.5, D-024, I-06).
// Used by the build (CSP meta tag) and checked against vercel.json by a test, so the
// two can never drift apart.

/** Directives, in the order they are written. `connect-src 'none'` is what stops exfiltration. */
export const CSP_DIRECTIVES = Object.freeze({
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'connect-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
});

/** Browsers ignore these when CSP comes from a <meta> tag, so the meta tag omits them. */
const HEADER_ONLY = new Set(['frame-ancestors']);

export function buildCsp({ forMeta = false } = {}) {
  return Object.entries(CSP_DIRECTIVES)
    .filter(([name]) => !(forMeta && HEADER_ONLY.has(name)))
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export const OTHER_HEADERS = Object.freeze({
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});

/** The `headers` section of vercel.json. */
export function buildVercelHeaders() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'Content-Security-Policy', value: buildCsp() },
      ...Object.entries(OTHER_HEADERS).map(([key, value]) => ({ key, value })),
    ],
  }];
}

/**
 * Insert the CSP meta tag as the first element in <head>, so it applies before
 * anything else is parsed. Throws if the page already has one.
 * @param {string} html
 */
export function injectCsp(html) {
  if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) throw new Error('index.html already has a CSP meta tag.');
  if (!/<head[^>]*>/i.test(html)) throw new Error('index.html has no <head>.');
  const tag = `\n    <meta http-equiv="Content-Security-Policy" content="${buildCsp({ forMeta: true })}" />`;
  return html.replace(/<head[^>]*>/i, (head) => `${head}${tag}`);
}

/** Vite plugin: production builds only. The dev server needs inline scripts for hot reload. */
export function cspPlugin() {
  return {
    name: 'atlas-csp',
    apply: 'build',
    transformIndexHtml: { order: 'post', handler: injectCsp },
  };
}
