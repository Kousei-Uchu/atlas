// What the radial diagram shows, worked out from the profile (M7-07, D-067). Pure and read-only.
//
// One wedge per visible top-level group, all the same size, in the order the groups are kept. Along each wedge,
// one segment per answered state, as long as the number of answers in that state. The wedge size and the order
// mean nothing, and there is no total, average, score or label (I-10). Unanswered is the absence of an answer
// (I-01), so it is counted apart and is never a segment.
import { effectiveStateId, getState, sortedByOrder } from './selectors.js';
import { getCycle } from './state-cycle.js';

export const MAX_WEDGES = 24;

/**
 * @returns {{ states: object[], wedges: Array<{ category: object, counts: Array<{ state: object, count: number }>, unanswered: number, answered: number }>, hiddenWedges: number, longest: number }}
 */
export function radialSummary(profile) {
  const states = getCycle(profile.states.filter((s) => s.isSelectable)).filter((s) => !s.isUnanswered);
  const roots = sortedByOrder(profile.categories.filter((c) => c.parentId === null && c.visibility === 'visible'));
  const children = new Map();
  for (const c of profile.categories) if (c.parentId !== null) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  const within = (rootId) => {
    const ids = new Set([rootId]);
    const queue = [rootId];
    while (queue.length) for (const kid of children.get(queue.shift()) ?? []) if (!ids.has(kid)) { ids.add(kid); queue.push(kid); }
    return ids;
  };
  const all = roots.map((category) => {
    const ids = within(category.id);
    const items = profile.items.filter((i) => i.type === 'state' && ids.has(i.categoryId));
    const tally = new Map(states.map((s) => [s.id, 0]));
    let unanswered = 0;
    for (const item of items) {
      const state = getState(profile, effectiveStateId(profile, item.id));
      if (!state || state.isUnanswered || !tally.has(state.id)) unanswered += 1;
      else tally.set(state.id, tally.get(state.id) + 1);
    }
    const counts = states.map((state) => ({ state, count: tally.get(state.id) })).filter((c) => c.count > 0);
    return { category, counts, unanswered, answered: counts.reduce((n, c) => n + c.count, 0) };
  }).filter((w) => w.answered + w.unanswered > 0);
  const wedges = all.slice(0, MAX_WEDGES);
  return { states, wedges, hiddenWedges: all.length - wedges.length, longest: wedges.reduce((m, w) => Math.max(m, w.answered), 0) };
}
