import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addAudience, setOverride } from '../../src/domain/audience-commands.js';
import { setItemState } from '../../src/domain/commands.js';
import { compareAudience } from '../../src/domain/audience-compare.js';

const NOW = '2026-11-03T10:00:00.000Z';
const must = (r) => { expect(r.ok, r.error).toBe(true); return r.profile; };
function base() {
  let p = createStarterProfile({ id: 'p1', now: NOW });
  p = must(addAudience(p, { id: 'aud_1', name: 'Friends', type: 'friends' }, NOW));
  return p;
}
const first = (p) => p.items.find((i) => i.type === 'state');

describe('compareAudience (M4-07)', () => {
  it('lists nothing when the audience sees exactly the own answers', () => {
    const r = compareAudience(base(), 'aud_1');
    expect(r).toMatchObject({ ok: true, rows: [], counts: { different: 0, moreOpen: 0, conflicts: 0 } });
  });

  it('lists an override that differs, with both answers, and flags it when it shows more', () => {
    let p = base();
    const item = first(p);
    p = must(setItemState(p, { itemId: item.id, stateId: 'no' }, NOW));
    p = must(setOverride(p, { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes', explanation: 'Close friends' }, NOW));
    const r = compareAudience(p, 'aud_1');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ itemId: item.id, ownStateId: 'no', audienceStateId: 'yes', source: 'override', moreOpen: true });
    expect(r.rows[0].reason).toBe('Close friends');
    expect(r.counts).toEqual({ different: 1, moreOpen: 1, conflicts: 0 });
  });

  it('does not list an override that matches the own answer', () => {
    let p = base();
    const item = first(p);
    p = must(setItemState(p, { itemId: item.id, stateId: 'yes' }, NOW));
    p = must(setOverride(p, { id: 'ov_1', itemId: item.id, audienceId: 'aud_1', stateId: 'yes' }, NOW));
    expect(compareAudience(p, 'aud_1').rows).toEqual([]);
  });

  it('keeps a conflict visible and does not choose for the person', () => {
    let p = base();
    const item = first(p);
    p = { ...p, overrides: [
      { id: 'ov_a', itemId: item.id, audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: '' },
      { id: 'ov_b', itemId: item.id, audienceId: 'aud_1', stateId: 'no', enabled: true, explanation: '' },
    ] };
    const r = compareAudience(p, 'aud_1');
    expect(r.rows[0]).toMatchObject({ source: 'conflict', audienceStateId: 'unanswered' });
    expect(r.counts.conflicts).toBe(1);
  });

  it('changes nothing and refuses a missing audience', () => {
    const p = base();
    const before = JSON.stringify(p);
    expect(compareAudience(p, 'nope')).toEqual({ ok: false, error: 'That audience no longer exists.' });
    compareAudience(p, 'aud_1');
    expect(JSON.stringify(p)).toBe(before);
  });
});
