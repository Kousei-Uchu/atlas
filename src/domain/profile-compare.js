// Comparing two charts, read-only (M7-05, D-065). Pure.
//
// It lines up the same question in two charts and lists where the answers differ, side by side, exactly as
// each chart has them. Nothing is scored: no match percentage, no "compatible", no total, no verdict (I-10).
// A question is "the same" in both charts when both came from the same module and key (`origin`). Questions
// that exist in only one chart are counted, not guessed at. Unanswered is the absence of an answer (I-01), so
// it can be one side of a difference but two Unanswered sides are not a line. Own words and notes are never
// read: only the answers to the state questions. Hidden groups are left out of both sides.
import { effectiveStateId, getState, sortedByOrder } from './selectors.js';

const keyOf = (item, category) => (category?.origin?.templateId && item.origin?.key ? `${category.origin.templateId}:${item.origin.key}` : null);

function index(profile) {
  const byKey = new Map();
  let unmatchable = 0;
  const visibleCategories = sortedByOrder(profile.categories.filter((c) => c.visibility === 'visible'));
  for (const category of visibleCategories) {
    for (const item of sortedByOrder(profile.items.filter((i) => i.categoryId === category.id && i.type === 'state'))) {
      const key = keyOf(item, category);
      if (key === null) { unmatchable += 1; continue; }
      byKey.set(key, { item, category, state: getState(profile, effectiveStateId(profile, item.id)) });
    }
  }
  return { byKey, unmatchable };
}

const sameState = (a, b) => a.label.trim().toLowerCase() === b.label.trim().toLowerCase();

/**
 * @returns {{ differences: Array<{ key: string, categoryName: string, label: string, mine: object, theirs: object }>,
 *   same: number, onlyInMine: number, onlyInTheirs: number, notComparable: number }}
 * `onlyInMine` and `onlyInTheirs` count answered questions the other chart does not have. `notComparable` counts
 * custom questions (no module origin) in the two charts together, which are never matched.
 */
export function compareProfiles(mine, theirs) {
  const a = index(mine);
  const b = index(theirs);
  const differences = [];
  let same = 0;
  let onlyInMine = 0;
  let onlyInTheirs = 0;
  for (const [key, left] of a.byKey) {
    const right = b.byKey.get(key);
    if (!right) { if (left.state && !left.state.isUnanswered) onlyInMine += 1; continue; }
    if (!left.state || !right.state) continue;
    if (left.state.isUnanswered && right.state.isUnanswered) continue;
    if (sameState(left.state, right.state)) same += 1;
    else differences.push({ key, categoryName: left.category.name, label: left.item.label, mine: left.state, theirs: right.state });
  }
  for (const [key, right] of b.byKey) {
    if (!a.byKey.has(key) && right.state && !right.state.isUnanswered) onlyInTheirs += 1;
  }
  return { differences, same, onlyInMine, onlyInTheirs, notComparable: a.unmatchable + b.unmatchable };
}
