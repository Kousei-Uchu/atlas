import { describe, expect, it } from 'vitest';
import { DIMENSION_MAP_TEMPLATES, dimensionMaps, dimensionStops } from '../../src/domain/dimension-map.js';
import { addModule } from '../../src/domain/module-commands.js';
import { setItemState } from '../../src/domain/commands.js';
import { getTemplate } from '../../src/content/templates/index.js';
import { createBlankProfile } from '../../src/domain/defaults.js';

const NOW = '2026-11-10T00:00:00.000Z';
const blank = () => createBlankProfile({ id: 'prof_a', title: 'T', now: NOW });
const withModule = (profile, id, visibility = 'visible') => {
  const r = addModule(profile, { template: getTemplate(id), visibility, acknowledgeAdult: true }, NOW);
  expect(r.ok).toBe(true);
  return r.profile;
};

describe('which modules have a map', () => {
  it('is only attraction and gender expression, which are never combined', () => {
    expect(DIMENSION_MAP_TEMPLATES).toEqual(['attraction', 'gender-expression']);
  });

  it('is empty until a module is turned on, and ignores other modules and hidden ones', () => {
    expect(dimensionMaps(blank())).toEqual([]);
    expect(dimensionMaps(withModule(blank(), 'personal-space'))).toEqual([]);
    expect(dimensionMaps(withModule(blank(), 'attraction', 'hidden'))).toEqual([]);
  });

  it('keeps each module separate, with one axis per answerable item and text items counted apart', () => {
    const profile = withModule(withModule(blank(), 'attraction'), 'gender-expression');
    const maps = dimensionMaps(profile);
    expect(maps.map((m) => m.templateId)).toEqual(['attraction', 'gender-expression']);
    const attraction = maps[0];
    const rowCount = attraction.groups.reduce((n, g) => n + g.rows.length, 0);
    const template = getTemplate('attraction');
    const stateItems = template.categories.flatMap((c) => c.items).filter((i) => (i.type ?? 'state') === 'state').length;
    expect(rowCount).toBe(stateItems);
    expect(attraction.groups.reduce((n, g) => n + g.textItems, 0)).toBeGreaterThan(0);
    // no row from one module appears in the other
    const ids = new Set(attraction.groups.flatMap((g) => g.rows.map((r) => r.item.id)));
    for (const g of maps[1].groups) for (const r of g.rows) expect(ids.has(r.item.id)).toBe(false);
  });
});

describe('stops', () => {
  it('puts Unanswered on its own at the start, then the states in cycle order', () => {
    const profile = blank();
    const stops = dimensionStops(profile);
    expect(stops[0].isUnanswered).toBe(true);
    expect(stops.slice(1).every((s) => !s.isUnanswered && s.isSelectable)).toBe(true);
    const orders = stops.slice(1).map((s) => s.cycleOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('answers', () => {
  it('start unanswered and read back what was chosen directly', () => {
    let profile = withModule(blank(), 'attraction');
    const row = dimensionMaps(profile)[0].groups[0].rows[0];
    expect(row.state.isUnanswered).toBe(true);
    profile = setItemState(profile, { itemId: row.item.id, stateId: 'yes' }, NOW).profile;
    expect(dimensionMaps(profile)[0].groups[0].rows[0].state.id).toBe('yes');
  });

  it('never adds anything up: a row is only an item and its state', () => {
    const profile = withModule(blank(), 'attraction');
    const row = dimensionMaps(profile)[0].groups[0].rows[0];
    expect(Object.keys(row).sort()).toEqual(['item', 'state']);
    expect(Object.keys(dimensionMaps(profile)[0]).sort()).toEqual(['groups', 'templateId']);
  });
});
