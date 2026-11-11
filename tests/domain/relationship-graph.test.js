import { describe, expect, it } from 'vitest';
import { relationshipGraph } from '../../src/domain/relationship-graph.js';
import { addAudience, setAudienceParent, setOverride } from '../../src/domain/audience-commands.js';
import { validateProfile } from '../../src/domain/validation.js';
import { layoutGraph } from '../../src/visualisations/relationship-graph/layout.js';
import { addModule } from '../../src/domain/module-commands.js';
import { getTemplate } from '../../src/content/templates/index.js';
import { createBlankProfile } from '../../src/domain/defaults.js';

const NOW = '2026-11-11T00:00:00.000Z';
let p = createBlankProfile({ id: 'prof_a', title: 'T', now: NOW });
const add = (profile, id, name, type = 'friends') => {
  const r = addAudience(profile, { id, name, type }, NOW);
  expect(r.ok).toBe(true);
  return r.profile;
};
const base = () => {
  let x = add(p, 'aud_friends', 'Friends');
  x = add(x, 'aud_close', 'Close friends', 'close-friends');
  x = add(x, 'aud_work', 'Work', 'school-work');
  return x;
};

describe('relationship graph', () => {
  it('is empty with no audiences', () => {
    expect(relationshipGraph(p).nodes).toEqual([]);
    expect(layoutGraph([]).nodes).toEqual([]);
  });

  it('puts each audience inside the one it was placed in, in reading order', () => {
    let x = base();
    x = setAudienceParent(x, { id: 'aud_close', parentId: 'aud_friends' }, NOW).profile;
    const nodes = relationshipGraph(x).nodes;
    expect(nodes.map((n) => [n.audience.id, n.depth, n.parentId])).toEqual([
      ['aud_friends', 0, null], ['aud_close', 1, 'aud_friends'], ['aud_work', 0, null],
    ]);
  });

  it('carries plain counts only, and nothing that rates a relationship', () => {
    const x = addModule(base(), { template: getTemplate('personal-space'), visibility: 'visible', acknowledgeAdult: true }, NOW).profile;
    const item = x.items.find((i) => i.type === 'state');
    const yes = x.states.find((s) => s.label === 'Yes');
    const r = setOverride(x, { id: 'ovr_1', itemId: item.id, audienceId: 'aud_work', stateId: yes.id }, NOW);
    expect(r.ok).toBe(true);
    const work = relationshipGraph(r.profile).nodes.find((n) => n.audience.id === 'aud_work');
    expect(work.overrides).toBe(1);
    expect(work.views).toBe(0);
    expect(Object.keys(work).join()).not.toMatch(/score|close|rank|strength|trust/i);
  });

  it('shows a broken parent or a loop at the top level instead of hiding anyone', () => {
    const x = base();
    const orphan = { ...x, audiences: x.audiences.map((a) => (a.id === 'aud_close' ? { ...a, parentId: 'gone' } : a)) };
    expect(relationshipGraph(orphan).nodes).toHaveLength(3);
    const loop = { ...x, audiences: x.audiences.map((a) => (a.id === 'aud_friends' ? { ...a, parentId: 'aud_close' } : a.id === 'aud_close' ? { ...a, parentId: 'aud_friends' } : a)) };
    expect(relationshipGraph(loop).nodes).toHaveLength(3);
  });

  it('lays out one row per audience, columns by depth, edges from the parent', () => {
    const layout = layoutGraph([{ id: 'a', depth: 0, parentId: null }, { id: 'b', depth: 1, parentId: 'a' }]);
    const [a, b] = layout.nodes;
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
    expect(layout.edges.map((e) => [e.from, e.to])).toEqual([['me', 'a'], ['a', 'b']]);
    expect(layout.width).toBeGreaterThan(b.x);
  });
});

describe('setAudienceParent', () => {
  it('places and clears, adds no undo step when nothing changes, and does not touch other data', () => {
    const x = base();
    const r = setAudienceParent(x, { id: 'aud_close', parentId: 'aud_friends' }, NOW);
    expect(r.profile.audiences.find((a) => a.id === 'aud_close').parentId).toBe('aud_friends');
    expect(setAudienceParent(r.profile, { id: 'aud_close', parentId: 'aud_friends' }, NOW).profile).toBe(r.profile);
    expect(setAudienceParent(r.profile, { id: 'aud_close', parentId: null }, NOW).profile.audiences.find((a) => a.id === 'aud_close').parentId).toBeNull();
    expect(r.profile.answers).toBe(x.answers);
    expect(r.profile.overrides).toBe(x.overrides);
  });

  it('refuses itself, a child, and a missing audience', () => {
    let x = base();
    x = setAudienceParent(x, { id: 'aud_close', parentId: 'aud_friends' }, NOW).profile;
    expect(setAudienceParent(x, { id: 'aud_friends', parentId: 'aud_friends' }, NOW).ok).toBe(false);
    expect(setAudienceParent(x, { id: 'aud_friends', parentId: 'aud_close' }, NOW).ok).toBe(false);
    expect(setAudienceParent(x, { id: 'aud_friends', parentId: 'nope' }, NOW).ok).toBe(false);
    expect(setAudienceParent(x, { id: 'nope', parentId: null }, NOW).ok).toBe(false);
  });

  it('a profile whose audiences loop fails validation', () => {
    const x = base();
    const loop = { ...x, audiences: x.audiences.map((a) => (a.id === 'aud_friends' ? { ...a, parentId: 'aud_close' } : a.id === 'aud_close' ? { ...a, parentId: 'aud_friends' } : a)) };
    expect(validateProfile(loop).ok).toBe(false);
    expect(validateProfile(x).ok).toBe(true);
  });
});
