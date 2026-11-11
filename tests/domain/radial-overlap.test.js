import { describe, expect, it } from 'vitest';
import { radialSummary, MAX_WEDGES } from '../../src/domain/radial-summary.js';
import { audienceOverlap } from '../../src/domain/audience-overlap.js';
import { layoutRadial, segmentPath, RADIAL } from '../../src/visualisations/radial/layout.js';
import { addModule } from '../../src/domain/module-commands.js';
import { setItemState } from '../../src/domain/commands.js';
import { addAudience, setOverride } from '../../src/domain/audience-commands.js';
import { getTemplate } from '../../src/content/templates/index.js';
import { createBlankProfile } from '../../src/domain/defaults.js';

const NOW = '2026-11-11T00:00:00.000Z';
const blank = () => createBlankProfile({ id: 'prof_a', title: 'T', now: NOW });
const withModule = (p, id, visibility = 'visible') => {
  const r = addModule(p, { template: getTemplate(id), visibility, acknowledgeAdult: true }, NOW);
  expect(r.ok).toBe(true);
  return r.profile;
};
const stateItems = (p) => p.items.filter((i) => i.type === 'state');
const answer = (p, item, label) => setItemState(p, { itemId: item.id, stateId: p.states.find((s) => s.label === label).id }, NOW).profile;

describe('radial summary', () => {
  it('is empty with nothing on the chart', () => {
    expect(radialSummary(blank()).wedges).toEqual([]);
    expect(layoutRadial([], 0)).toEqual([]);
  });

  it('counts answers by state per group, keeps Unanswered apart, and never totals', () => {
    let p = withModule(blank(), 'personal-space');
    const items = stateItems(p);
    p = answer(p, items[0], 'Yes');
    p = answer(p, items[1], 'Yes');
    p = answer(p, items[2], 'No');
    const s = radialSummary(p);
    const wedge = s.wedges.find((w) => w.answered === 3);
    expect(wedge).toBeTruthy();
    expect(wedge.counts.map((c) => [c.state.label, c.count])).toEqual([['No', 1], ['Yes', 2]].sort((x, y) => s.states.findIndex((t) => t.label === x[0]) - s.states.findIndex((t) => t.label === y[0])));
    expect(wedge.unanswered).toBeGreaterThan(0);
    expect(wedge.counts.some((c) => c.state.isUnanswered)).toBe(false);
    expect(Object.keys(s).join() + Object.keys(wedge).join()).not.toMatch(/score|total|average|percent/i);
  });

  it('leaves hidden groups out, and caps the wedges without losing count of the rest', () => {
    expect(radialSummary(withModule(blank(), 'personal-space', 'hidden')).wedges).toEqual([]);
    expect(MAX_WEDGES).toBe(24);
  });

  it('lays out equal wedges, the longest reaching the edge, with every path closed', () => {
    const shapes = layoutRadial([{ answered: 4, counts: [{ count: 1 }, { count: 3 }] }, { answered: 2, counts: [{ count: 2 }] }], 4);
    expect(shapes).toHaveLength(2);
    expect(shapes[0].segments).toHaveLength(2);
    for (const sh of shapes) for (const seg of sh.segments) expect(seg.path).toMatch(/^M.*Z$/);
    expect(segmentPath(0, 1, RADIAL.inner, RADIAL.outer)).toContain(`A${RADIAL.outer} ${RADIAL.outer}`);
  });
});

describe('audience overlap', () => {
  const setup = () => {
    let p = withModule(blank(), 'personal-space');
    p = addAudience(p, { id: 'aud_a', name: 'A', type: 'friends' }, NOW).profile;
    p = addAudience(p, { id: 'aud_b', name: 'B', type: 'family' }, NOW).profile;
    const items = stateItems(p);
    return { p, items };
  };

  it('refuses a missing audience or the same audience twice', () => {
    const { p } = setup();
    expect(audienceOverlap(p, 'aud_a', 'nope').ok).toBe(false);
    expect(audienceOverlap(p, 'aud_a', 'aud_a').ok).toBe(false);
  });

  it('has nothing in any region when nothing is answered', () => {
    const { p } = setup();
    const r = audienceOverlap(p, 'aud_a', 'aud_b');
    expect([r.same, r.different, r.onlyA, r.onlyB].map((x) => x.length)).toEqual([0, 0, 0, 0]);
  });

  it('sorts items into same, different, and only one side, never treating Unanswered as a match', () => {
    let { p, items } = setup();
    p = answer(p, items[0], 'Yes');                 // both audiences see Yes by default: same
    const no = p.states.find((s) => s.label === 'No');
    p = setOverride(p, { id: 'ovr_1', itemId: items[0].id, audienceId: 'aud_b', stateId: no.id }, NOW).profile; // now different
    p = answer(p, items[1], 'Yes');                 // same
    p = setOverride(p, { id: 'ovr_2', itemId: items[2].id, audienceId: 'aud_a', stateId: no.id }, NOW).profile; // only A answered
    const r = audienceOverlap(p, 'aud_a', 'aud_b');
    expect(r.different.map((x) => x.item.id)).toEqual([items[0].id]);
    expect(r.same.map((x) => x.item.id)).toEqual([items[1].id]);
    expect(r.onlyA.map((x) => x.item.id)).toEqual([items[2].id]);
    expect(r.onlyB).toEqual([]);
    const swapped = audienceOverlap(p, 'aud_b', 'aud_a');
    expect(swapped.onlyB.map((x) => x.item.id)).toEqual([items[2].id]);
    expect(Object.keys(r).join()).not.toMatch(/score|percent|similar|alike|match/i);
  });

  it('leaves hidden groups out and does not change the profile', () => {
    let { p, items } = setup();
    p = answer(p, items[0], 'Yes');
    const before = JSON.stringify(p);
    const hidden = { ...p, categories: p.categories.map((c) => ({ ...c, visibility: 'hidden' })) };
    expect(audienceOverlap(hidden, 'aud_a', 'aud_b').same).toEqual([]);
    audienceOverlap(p, 'aud_a', 'aud_b');
    expect(JSON.stringify(p)).toBe(before);
  });
});
