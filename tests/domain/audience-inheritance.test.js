import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addAudience, setOverride, setAudienceParent } from '../../src/domain/audience-commands.js';
import { setItemState } from '../../src/domain/commands.js';
import { resolveItem, resolveAll, explainResolution, ancestorsOf } from '../../src/domain/audience-resolution.js';
import { permissivenessOf } from '../../src/domain/palette-commands.js';

const NOW = '2026-10-26T10:00:00.000Z';

function setup() {
  const p0 = createStarterProfile({ id: 'p1', title: 'T', now: NOW });
  const item = p0.items.find((i) => i.type === 'state');
  let p = p0;
  for (const [id, name] of [['aud_g', 'Group'], ['aud_c', 'Child'], ['aud_d', 'Grandchild']]) p = addAudience(p, { id, name, type: 'partner' }, NOW).profile;
  p = setAudienceParent(p, { id: 'aud_c', parentId: 'aud_g' }, NOW).profile;
  p = setAudienceParent(p, { id: 'aud_d', parentId: 'aud_c' }, NOW).profile;
  const by = (sem) => p.states.find((s) => s.isSelectable && s.semantic === sem).id;
  return { p, item, no: by('negative'), yes: by('positive') };
}
const answer = (p, itemId, stateId) => setItemState(p, { itemId, stateId }, NOW).profile;
const ov = (p, id, itemId, audienceId, stateId, explanation = '') => setOverride(p, { id, itemId, audienceId, stateId, explanation }, NOW).profile;

describe('audience inheritance (D-073)', () => {
  it('lists ancestors nearest first and survives loops and missing parents', () => {
    const { p } = setup();
    expect(ancestorsOf(p, 'aud_d')).toEqual(['aud_c', 'aud_g']);
    const looped = { ...p, audiences: p.audiences.map((a) => (a.id === 'aud_g' ? { ...a, parentId: 'aud_d' } : a)) };
    expect(ancestorsOf(looped, 'aud_d')).toEqual(['aud_c', 'aud_g']);
    const missing = { ...p, audiences: p.audiences.map((a) => (a.id === 'aud_c' ? { ...a, parentId: 'nope' } : a)) };
    expect(ancestorsOf(missing, 'aud_d')).toEqual(['aud_c']);
  });

  it('inherits a narrower parent override, through more than one level', () => {
    const { p, item, no, yes } = setup();
    const q = ov(answer(p, item.id, yes), 'ov1', item.id, 'aud_g', no, 'private group');
    for (const id of ['aud_c', 'aud_d']) {
      const r = resolveItem(q, item.id, id);
      expect(r).toMatchObject({ stateId: no, source: 'inherited', inheritedFromId: 'aud_g', moreOpenThanDefault: false, differs: true });
    }
    expect(explainResolution(q, resolveItem(q, item.id, 'aud_c'))).toMatch(/inherited from Group.*Their reason: private group/);
    expect(resolveItem(q, item.id, 'aud_g').source).toBe('override');
  });

  it('never widens: a parent override more open than the answer is held back', () => {
    const { p, item, no, yes } = setup();
    const q = ov(answer(p, item.id, no), 'ov1', item.id, 'aud_g', yes);
    const r = resolveItem(q, item.id, 'aud_c');
    expect(r).toMatchObject({ stateId: no, source: 'answer', heldBack: { audienceId: 'aud_g', stateId: yes } });
    expect(explainResolution(q, r)).toMatch(/not passed down/);
    // An unanswered item is also never opened by a parent.
    const r2 = resolveItem(ov(p, 'ov2', item.id, 'aud_g', yes), item.id, 'aud_c');
    expect(r2).toMatchObject({ stateId: 'unanswered', source: 'unanswered' });
  });

  it('a direct override beats an inherited one, even when more open', () => {
    const { p, item, no, yes } = setup();
    let q = ov(answer(p, item.id, no), 'ov1', item.id, 'aud_g', no);
    q = ov(q, 'ov2', item.id, 'aud_c', yes);
    expect(resolveItem(q, item.id, 'aud_c')).toMatchObject({ stateId: yes, source: 'override' });
    // The grandchild inherits from the nearest parent that speaks, not the farthest.
    expect(resolveItem(q, item.id, 'aud_d')).toMatchObject({ source: 'answer', heldBack: { audienceId: 'aud_c' } });
  });

  it('disabled overrides are not inherited', () => {
    const { p, item, no, yes } = setup();
    const q = ov(answer(p, item.id, yes), 'ov1', item.id, 'aud_g', no);
    const off = { ...q, overrides: q.overrides.map((o) => ({ ...o, enabled: false })) };
    expect(resolveItem(off, item.id, 'aud_c').source).toBe('answer');
  });

  it('disagreeing parent overrides inherit as Unanswered and say so', () => {
    const { p, item, no, yes } = setup();
    let q = answer(p, item.id, yes);
    q = { ...q, overrides: [
      { id: 'a', itemId: item.id, audienceId: 'aud_g', stateId: no, enabled: true, explanation: '' },
      { id: 'b', itemId: item.id, audienceId: 'aud_g', stateId: yes, enabled: true, explanation: '' },
    ] };
    const r = resolveItem(q, item.id, 'aud_c');
    expect(r).toMatchObject({ stateId: 'unanswered', source: 'inherited', overrideId: null });
    expect(explainResolution(q, r)).toMatch(/overrides that disagree/);
  });

  it('inherited results are never more open than the answer, across every item', () => {
    const { p, item, no, yes } = setup();
    const q = ov(answer(p, item.id, no), 'ov1', item.id, 'aud_g', yes);
    for (const r of resolveAll(q, 'aud_d')) {
      const shown = q.states.find((s) => s.id === r.stateId);
      const own = q.states.find((s) => s.id === r.defaultStateId);
      expect(permissivenessOf(shown)).toBeLessThanOrEqual(permissivenessOf(own));
    }
  });

  it('top-level audiences and the default (null) never inherit', () => {
    const { p, item, no, yes } = setup();
    const q = ov(answer(p, item.id, yes), 'ov1', item.id, 'aud_c', no);
    expect(resolveItem(q, item.id, 'aud_g').source).toBe('answer');
    expect(resolveItem(q, item.id, null).source).toBe('answer');
  });
});
