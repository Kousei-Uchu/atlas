// What the decision tree shows, worked out from the profile (M7-04, D-064). Pure and read-only.
//
// The tree is a view over the Overwhelm or support plan. It has no data of its own: the root is the plan,
// each branch is one of its groups, and each leaf is something the person already wrote or answered.
// Branches follow the plan's own order ("early signs", "what helps", "what others can do", "afterwards").
// Nothing is worked out from the answers: no advice, no ranking, no label (I-10). Unanswered items are not
// leaves, because Unanswered is the absence of an answer (I-01).
import { effectiveStateId, getAnswer, getState, sortedByOrder } from './selectors.js';
import { valueText } from './item-values.js';

export const DECISION_TREE_TEMPLATE = 'overwhelm-plan';

/**
 * @returns {null | { branches: Array<{ category: object, texts: Array<{ item: object, text: string }>,
 *   groups: Array<{ state: object, items: object[] }>, empty: boolean }>, leafCount: number }}
 * null when the plan is not on or is hidden.
 */
export function decisionTree(profile) {
  const categories = sortedByOrder(
    profile.categories.filter((c) => c.origin?.templateId === DECISION_TREE_TEMPLATE && c.visibility === 'visible'),
  );
  if (categories.length === 0) return null;
  let leafCount = 0;
  const branches = categories.map((category) => {
    const items = sortedByOrder(profile.items.filter((i) => i.categoryId === category.id));
    const texts = items
      .filter((i) => i.type !== 'state')
      .map((item) => ({ item, text: valueText(item, getAnswer(profile, item.id)).trim() }))
      .filter((row) => row.text !== '');
    const byState = new Map();
    for (const item of items.filter((i) => i.type === 'state')) {
      const state = getState(profile, effectiveStateId(profile, item.id));
      if (!state || state.isUnanswered) continue;
      if (!byState.has(state.id)) byState.set(state.id, { state, items: [] });
      byState.get(state.id).items.push(item);
    }
    const order = new Map(profile.states.map((s, index) => [s.id, index]));
    const groups = [...byState.values()].sort((a, b) => order.get(a.state.id) - order.get(b.state.id));
    leafCount += texts.length + groups.reduce((n, g) => n + g.items.length, 0);
    return { category, texts, groups, empty: texts.length === 0 && groups.length === 0 };
  });
  return { branches, leafCount };
}
