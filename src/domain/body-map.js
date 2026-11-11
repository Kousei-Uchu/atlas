// What the body map shows, worked out from the profile (M7-01, D-061). Pure and read-only: the map never
// edits anything itself. Answers are changed through the usual commands.
import { regionIdFromKey, REGIONS } from '../visualisations/body-map/geometry.js';
import { effectiveStateId, getState, sortedByOrder } from './selectors.js';

export const BODY_MAP_TEMPLATE_ID = 'body-contact-map';

/** The groups of the body contact map module that are showing, in the person's order. */
export function bodyMapGroups(profile) {
  return sortedByOrder(profile.categories.filter((c) => c.origin?.templateId === BODY_MAP_TEMPLATE_ID && c.visibility === 'visible'));
}

/**
 * One group as rows, one per region of the map, in reading order.
 * A region whose item the person deleted has `item: null` and cannot be answered here.
 * Items the person added to the group themselves are not on the map; they are counted in `others`.
 * @returns {{ rows: Array<{ region: {id:string,label:string}, item: object|null, state: object|null }>, others: number }}
 */
export function bodyMapRows(profile, categoryId) {
  const category = profile.categories.find((c) => c.id === categoryId);
  if (!category) return { rows: [], others: 0 };
  const items = profile.items.filter((i) => i.categoryId === categoryId && i.type === 'state');
  const byRegion = new Map();
  for (const item of items) {
    const id = item.origin?.templateId === BODY_MAP_TEMPLATE_ID ? regionIdFromKey(category.origin?.key, item.origin.key) : null;
    if (id && !byRegion.has(id)) byRegion.set(id, item);
  }
  const rows = REGIONS.map((region) => {
    const item = byRegion.get(region.id) ?? null;
    return { region, item, state: item ? getState(profile, effectiveStateId(profile, item.id)) : null };
  });
  return { rows, others: items.length - byRegion.size };
}
