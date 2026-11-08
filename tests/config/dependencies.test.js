// Dependency policy (spec 14.1, M6-01): a short, exact-pinned runtime list, so a compromised or
// surprising package cannot arrive unnoticed. Adding a runtime dependency should be a visible decision.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const EXACT = /^\d+\.\d+\.\d+$/;

describe('dependencies', () => {
  it('has exactly these runtime dependencies', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['idb', 'react', 'react-dom', 'zod']);
  });

  it('pins every dependency to an exact version', () => {
    for (const group of ['dependencies', 'devDependencies']) {
      for (const [name, version] of Object.entries(pkg[group])) expect(version, `${group}.${name}`).toMatch(EXACT);
    }
  });

  it('installs pinned versions by default', () => {
    expect(readFileSync('.npmrc', 'utf8')).toMatch(/save-exact=true/);
  });

  it('keeps test-only libraries out of the runtime list', () => {
    for (const name of ['jsqr', 'axe-core', 'fake-indexeddb', 'jsdom', 'vitest', '@playwright/test']) expect(pkg.dependencies[name], name).toBeUndefined();
  });
});
