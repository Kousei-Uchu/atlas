import { describe, it, expect } from 'vitest';
import {
  assessStateContrast, contrastRatio, contrastWarningText, parseHex, relativeLuminance,
} from '../../src/domain/contrast.js';
import { createDefaultStates } from '../../src/domain/defaults.js';

describe('parseHex', () => {
  it('reads a full hex colour, in either case', () => {
    expect(parseHex('#0b4f8a')).toEqual([11, 79, 138]);
    expect(parseHex('#FFFFFF')).toEqual([255, 255, 255]);
  });

  it.each(['', '#fff', '0b4f8a', '#0b4f8', '#0b4f8aa', '#gggggg', null, undefined, 42])('rejects %s', (value) => {
    expect(parseHex(value)).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('gives 21 for black on white and 1 for the same colour', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('does not depend on which colour is the background', () => {
    expect(contrastRatio('#0b4f8a', '#f7f7f5')).toBeCloseTo(contrastRatio('#f7f7f5', '#0b4f8a'), 10);
  });

  it('matches known WCAG values at the 4.5 boundary', () => {
    // #767676 is the lightest grey that passes AA on white; #777777 just misses.
    expect(contrastRatio('#ffffff', '#767676')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', '#777777')).toBeLessThan(4.5);
  });

  it('returns null for an incomplete or invalid colour', () => {
    expect(contrastRatio('#fff', '#000000')).toBeNull();
    expect(contrastRatio('#000000', 'red')).toBeNull();
  });

  it('computes luminance for the extremes', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
  });
});

describe('assessStateContrast', () => {
  it('has no warning for strong and acceptable contrast', () => {
    expect(assessStateContrast('#ffffff', '#000000')).toMatchObject({ level: 'good', warn: false });
    expect(assessStateContrast('#ffffff', '#767676')).toMatchObject({ level: 'ok', warn: false });
  });

  it('warns "low" between 3 and 4.5 and "poor" under 3', () => {
    expect(assessStateContrast('#ffffff', '#949494')).toMatchObject({ level: 'low', warn: true });
    expect(assessStateContrast('#ffffff', '#cccccc')).toMatchObject({ level: 'poor', warn: true });
  });

  it('never rounds a failing ratio up to a pass in the shown value', () => {
    const result = assessStateContrast('#ffffff', '#777777');
    expect(result.warn).toBe(true);
    expect(result.shown).toBeLessThan(4.5);
  });

  it('returns null while a colour is still being typed', () => {
    expect(assessStateContrast('#ffffff', '#00')).toBeNull();
  });

  it('passes for every built-in state, so the defaults never warn', () => {
    for (const state of createDefaultStates()) {
      expect(assessStateContrast(state.color, state.textColor), state.id).toMatchObject({ warn: false });
    }
  });
});

describe('contrastWarningText', () => {
  it('is null when there is nothing to warn about', () => {
    expect(contrastWarningText(null)).toBeNull();
    expect(contrastWarningText(assessStateContrast('#ffffff', '#000000'))).toBeNull();
  });

  it('states the ratio and a way to fix it, in plain words', () => {
    const text = contrastWarningText(assessStateContrast('#ffffff', '#cccccc'));
    expect(text).toMatch(/^Low contrast: 1\.\d to 1\./);
    expect(text).toMatch(/darker or lighter/);
    expect(text).toMatch(/name and icon/);
    const weak = contrastWarningText(assessStateContrast('#ffffff', '#949494'));
    expect(weak).toMatch(/^Weak contrast: 3\.\d to 1\./);
  });
});
