import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrastRatio } from '../../src/domain/contrast.js';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

/** The custom properties declared in the block that follows an exact selector. */
function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No block for ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const light = tokens(':root');
const darkDevice = tokens(':root:not([data-theme])'); // used when the device asks for dark
const darkChosen = tokens(":root[data-theme='dark']");
const highContrast = tokens(":root[data-theme='high-contrast']");

const COLOUR_TOKENS = ['--bg', '--surface', '--text', '--text-muted', '--border', '--border-soft', '--accent', '--accent-text', '--danger', '--focus', '--notice-bg', '--error-bg', '--warn'];

describe('theme tokens', () => {
  it('has the same dark values whether dark comes from the device or from the menu', () => {
    expect(darkChosen).toEqual({ ...darkDevice });
  });

  it('defines every colour token in every theme', () => {
    for (const [name, theme] of Object.entries({ light, darkDevice, highContrast })) {
      for (const token of COLOUR_TOKENS) expect(theme[token], `${name} ${token}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

/** Pairs that sit on top of each other in the interface: [text token, background token]. */
const TEXT_PAIRS = [
  ['--text', '--bg'],
  ['--text', '--surface'],
  ['--text-muted', '--bg'],
  ['--text-muted', '--surface'],
  ['--text', '--notice-bg'],
  ['--danger', '--surface'],
  ['--danger', '--error-bg'],
  ['--warn', '--surface'],
  ['--accent-text', '--accent'],
];

describe('theme contrast', () => {
  const themes = { light, dark: darkChosen, 'high-contrast': highContrast };

  for (const [name, theme] of Object.entries(themes)) {
    const target = name === 'high-contrast' ? 7 : 4.5;
    it(`${name}: every text pair reaches ${target} to 1`, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(contrastRatio(theme[fg], theme[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(target);
      }
    });

    it(`${name}: focus ring and borders reach 3 to 1 against the page`, () => {
      expect(contrastRatio(theme['--focus'], theme['--bg'])).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme['--border'], theme['--bg'])).toBeGreaterThanOrEqual(3);
    });
  }

  it('high contrast uses no soft borders or fills that blur panels into the page', () => {
    expect(highContrast['--border-soft']).toBe(highContrast['--text']);
    expect(highContrast['--surface']).toBe(highContrast['--bg']);
    expect(highContrast['--notice-bg']).toBe(highContrast['--bg']);
    expect(highContrast['--error-bg']).toBe(highContrast['--bg']);
  });
});

describe('high-contrast badges', () => {
  it('overrides the per-state colours, which React sets inline, with !important', () => {
    const base = readFileSync(new URL('../../src/styles/base.css', import.meta.url), 'utf8');
    const block = base.slice(base.indexOf(":root[data-theme='high-contrast'] .state-badge"));
    expect(block).toMatch(/--state-bg:\s*var\(--surface\)\s*!important/);
    expect(block).toMatch(/--state-fg:\s*var\(--text\)\s*!important/);
  });
});
