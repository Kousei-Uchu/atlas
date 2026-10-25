// M1-15 / M1-AC-10: headers are defined once, and vercel.json matches them (D-024, I-06).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCsp, buildVercelHeaders, injectCsp } from '../../config/security.js';

describe('content security policy', () => {
  it('blocks all network connections and third-party scripts', () => {
    const csp = buildCsp();
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
  });

  it('omits frame-ancestors from the meta tag, where browsers ignore it', () => {
    expect(buildCsp({ forMeta: true })).not.toContain('frame-ancestors');
    expect(buildCsp({ forMeta: true })).toContain("connect-src 'none'");
  });
});

describe('vercel.json', () => {
  const file = JSON.parse(readFileSync('vercel.json', 'utf8'));

  it('matches the generated headers exactly', () => {
    expect(file.headers).toEqual(buildVercelHeaders());
  });

  it('carries the required response headers', () => {
    const names = file.headers[0].headers.map((h) => h.key);
    expect(names).toEqual(expect.arrayContaining([
      'Content-Security-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'Permissions-Policy',
    ]));
    expect(file.headers[0].headers.find((h) => h.key === 'Referrer-Policy').value).toBe('no-referrer');
  });

  it('has no rewrites, because the app has no path routes (D-017)', () => {
    expect(file.rewrites).toBeUndefined();
  });
});

describe('injectCsp', () => {
  const page = '<!doctype html><html><head><meta charset="UTF-8" /></head><body></body></html>';

  it('puts the meta tag first in <head>', () => {
    const out = injectCsp(page);
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('charset'));
  });

  it('refuses to add a second policy, or to run without a head', () => {
    expect(() => injectCsp(injectCsp(page))).toThrow(/already/);
    expect(() => injectCsp('<html></html>')).toThrow(/head/);
  });
});
