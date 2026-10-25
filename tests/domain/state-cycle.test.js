import { describe, it, expect } from 'vitest';
import { createDefaultStates } from '../../src/domain/defaults.js';
import { getNextState, getCycle, directionForAction } from '../../src/domain/state-cycle.js';

const states = createDefaultStates();
const next = (from, dir, endBehaviour = 'clamp', s = states) => getNextState(from, s, dir, { endBehaviour });

describe('default cycle order (spec 6.2)', () => {
  it('orders No, Unsure, Unanswered, Conditional, Yes with N/A outside', () => {
    expect(getCycle(states).map((s) => s.id)).toEqual(['no', 'unsure', 'unanswered', 'conditional', 'yes']);
  });

  const table = [
    ['yes', 'conditional', 'yes'],
    ['conditional', 'unanswered', 'yes'],
    ['unanswered', 'unsure', 'conditional'],
    ['unsure', 'no', 'unanswered'],
    ['no', 'no', 'unsure'],
    ['not-applicable', 'unanswered', 'unanswered'],
  ];
  it.each(table)('from %s: negative -> %s, positive -> %s', (from, neg, pos) => {
    expect(next(from, 'negative')).toMatchObject({ ok: true, stateId: neg });
    expect(next(from, 'positive')).toMatchObject({ ok: true, stateId: pos });
  });
});

describe('end behaviour', () => {
  it('clamps at both ends and reports it', () => {
    expect(next('no', 'negative')).toEqual({ ok: true, stateId: 'no', clamped: true });
    expect(next('yes', 'positive')).toEqual({ ok: true, stateId: 'yes', clamped: true });
  });
  it('loops at both ends', () => {
    expect(next('no', 'negative', 'loop')).toEqual({ ok: true, stateId: 'yes', clamped: false });
    expect(next('yes', 'positive', 'loop')).toEqual({ ok: true, stateId: 'no', clamped: false });
  });
});

describe('missing and off-cycle states (I-01, D-007)', () => {
  it('treats a missing current state as Unanswered, so one step never lands on yes', () => {
    for (const missing of [undefined, null]) {
      expect(next(missing, 'positive')).toMatchObject({ stateId: 'conditional' });
      expect(next(missing, 'negative')).toMatchObject({ stateId: 'unsure' });
    }
  });
  it('leaves an off-cycle state for Unanswered in either direction', () => {
    expect(next('not-applicable', 'positive').stateId).toBe('unanswered');
    expect(next('not-applicable', 'negative').stateId).toBe('unanswered');
  });
});

describe('custom order', () => {
  it('follows cycleOrder, not array order, colour or label', () => {
    const custom = createDefaultStates().map((s) => ({ ...s, label: 'X', color: '#000000' }));
    custom.find((s) => s.id === 'yes').cycleOrder = 5; // Yes now sits first
    expect(getCycle(custom).map((s) => s.id)).toEqual(['yes', 'no', 'unsure', 'unanswered', 'conditional']);
    expect(next('yes', 'positive', 'clamp', custom).stateId).toBe('no');
  });
  it('lets a state be added to or removed from the cycle', () => {
    const custom = createDefaultStates();
    custom.find((s) => s.id === 'not-applicable').cycleOrder = 60;
    expect(next('yes', 'positive', 'clamp', custom).stateId).toBe('not-applicable');
  });
});

describe('invalid configuration returns an error and never throws', () => {
  it('rejects a cycle without Unanswered', () => {
    const bad = createDefaultStates();
    bad.find((s) => s.id === 'unanswered').cycleOrder = null;
    expect(next('yes', 'negative', 'clamp', bad).ok).toBe(false);
  });
  it('rejects duplicate cycle positions', () => {
    const bad = createDefaultStates();
    bad.find((s) => s.id === 'yes').cycleOrder = 40;
    expect(next('yes', 'negative', 'clamp', bad).ok).toBe(false);
  });
  it('rejects an unknown current state, direction and end behaviour', () => {
    expect(next('mystery', 'negative').ok).toBe(false);
    expect(next('yes', 'sideways').ok).toBe(false);
    expect(next('yes', 'negative', 'bounce').ok).toBe(false);
    expect(getNextState('yes', null, 'negative').ok).toBe(false);
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const frozen = Object.freeze(createDefaultStates().map((s) => Object.freeze({ ...s })));
    expect(() => getNextState('yes', frozen, 'negative', { endBehaviour: 'clamp' })).not.toThrow();
  });
});

describe('directionForAction (D-003)', () => {
  it('maps primary to the configured direction and secondary to the opposite', () => {
    expect(directionForAction('primary', 'negative')).toBe('negative');
    expect(directionForAction('secondary', 'negative')).toBe('positive');
    expect(directionForAction('primary', 'positive')).toBe('positive');
    expect(directionForAction('secondary', 'positive')).toBe('negative');
  });
});
