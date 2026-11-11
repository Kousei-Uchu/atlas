import { describe, expect, it } from 'vitest';
import { bodyMapGroups, bodyMapRows } from '../../src/domain/body-map.js';
import { addModule, setModuleVisibility } from '../../src/domain/module-commands.js';
import { addItem, deleteItem, setItemState } from '../../src/domain/commands.js';
import { getTemplate } from '../../src/content/templates/index.js';
import { REGIONS } from '../../src/visualisations/body-map/geometry.js';
import { createBlankProfile } from '../../src/domain/defaults.js';

const NOW = '2026-11-10T00:00:00.000Z';
const make = () => {
  const base = createBlankProfile({ id: 'prof_a', title: 'Test', now: NOW });
  const added = addModule(base, { template: getTemplate('body-contact-map'), visibility: 'visible', acknowledgeAdult: true }, NOW);
  expect(added.ok).toBe(true);
  return added.profile;
};

describe('bodyMapGroups', () => {
  it('is empty without the module, and lists the groups once it is on', () => {
    expect(bodyMapGroups(createBlankProfile({ id: 'prof_a', title: 'x', now: NOW }))).toEqual([]);
    expect(bodyMapGroups(make()).map((c) => c.name)).toContain('Touch from friends');
  });

  it('leaves out a module that is hidden', () => {
    const hidden = setModuleVisibility(make(), { template: getTemplate('body-contact-map'), visibility: 'hidden' }, NOW);
    expect(hidden.ok).toBe(true);
    expect(bodyMapGroups(hidden.profile)).toEqual([]);
  });
});

describe('bodyMapRows', () => {
  it('gives one unanswered row per region, in reading order (I-01)', () => {
    const profile = make();
    const group = bodyMapGroups(profile)[0];
    const { rows, others } = bodyMapRows(profile, group.id);
    expect(rows.map((r) => r.region.id)).toEqual(REGIONS.map((r) => r.id));
    expect(rows.every((r) => r.item && r.state.isUnanswered)).toBe(true);
    expect(others).toBe(0);
  });

  it('reads an answer, keeps groups apart, and shows a deleted region as missing', () => {
    let profile = make();
    const [friends, family] = bodyMapGroups(profile);
    const neck = bodyMapRows(profile, friends.id).rows.find((r) => r.region.id === 'neck').item;
    const yes = profile.states.find((s) => s.id === 'yes');
    profile = setItemState(profile, { itemId: neck.id, stateId: yes.id }, NOW).profile;
    expect(bodyMapRows(profile, friends.id).rows.find((r) => r.region.id === 'neck').state.id).toBe(yes.id);
    expect(bodyMapRows(profile, family.id).rows.find((r) => r.region.id === 'neck').state.isUnanswered).toBe(true);

    profile = deleteItem(profile, { id: neck.id }, NOW).profile;
    const gone = bodyMapRows(profile, friends.id).rows.find((r) => r.region.id === 'neck');
    expect(gone.item).toBeNull();
    expect(gone.state).toBeNull();
  });

  it('counts items the person added themselves, which are not on the map', () => {
    let profile = make();
    const group = bodyMapGroups(profile)[0];
    profile = addItem(profile, { id: 'item_zz', categoryId: group.id, label: 'My own item' }, NOW).profile;
    const { rows, others } = bodyMapRows(profile, group.id);
    expect(others).toBe(1);
    expect(rows.length).toBe(REGIONS.length);
  });

  it('returns nothing for an unknown group', () => {
    expect(bodyMapRows(make(), 'cat_missing')).toEqual({ rows: [], others: 0 });
  });
});
