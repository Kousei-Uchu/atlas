// What the dimension map shows, worked out from the profile (M7-02, D-062). Pure and read-only.
//
// A dimension map shows each item of a module as its own axis, with the states as labelled stops on it.
// There is no combined position, no score, no total and no label worked out from the answers (I-10, D-008).
// Only the two modules that are about people's own words and feelings have a map, and the maps never share
// a screen or a drawing: the attraction answers and the gender answers are never used to read each other.
import { effectiveStateId, getState, selectableStates, sortedByOrder } from './selectors.js';
import { getCycle } from './state-cycle.js';

export const DIMENSION_MAP_TEMPLATES = Object.freeze(['attraction', 'gender-expression']);

/**
 * The stops on every axis, left to right: "Unanswered" on its own at the start, then the states a person can
 * choose, in the order the click cycle uses. Unanswered is not part of the scale; it is the absence of an answer.
 */
export function dimensionStops(profile) {
  const unanswered = profile.states.find((s) => s.isUnanswered);
  const chooseable = getCycle(selectableStates(profile)).filter((s) => !s.isUnanswered);
  return [unanswered, ...chooseable].filter(Boolean);
}

/**
 * The visible modules that have a map, each with its showing groups and, per group, one row per answerable item.
 * Text items are not axes. They are counted so the screen can say they are in the chart.
 * @returns {Array<{ templateId: string, groups: Array<{ category: object, rows: Array<{ item: object, state: object }>, textItems: number }> }>}
 */
export function dimensionMaps(profile) {
  return DIMENSION_MAP_TEMPLATES.map((templateId) => {
    const categories = sortedByOrder(profile.categories.filter((c) => c.origin?.templateId === templateId && c.visibility === 'visible'));
    const groups = categories.map((category) => {
      const items = sortedByOrder(profile.items.filter((i) => i.categoryId === category.id));
      const rows = items
        .filter((i) => i.type === 'state')
        .map((item) => ({ item, state: getState(profile, effectiveStateId(profile, item.id)) }))
        .filter((row) => row.state);
      return { category, rows, textItems: items.filter((i) => i.type === 'text').length };
    });
    return { templateId, groups };
  }).filter((map) => map.groups.length > 0);
}
