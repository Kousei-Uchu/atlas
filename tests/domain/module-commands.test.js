import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import { validateTemplate } from '../../src/domain/templates.js';
import { addModule, moduleStatus, setModuleVisibility } from '../../src/domain/module-commands.js';
import { setItemState } from '../../src/domain/commands.js';
import { getCategoryTree } from '../../src/domain/selectors.js';
import { LIMITS } from '../../src/domain/limits.js';
import { TEMPLATES } from '../../src/content/templates/index.js';

const NOW = '2026-10-26T10:00:00.000Z';
const LATER = '2026-10-26T11:00:00.000Z';

const raw = (over = {}) => ({
  templateId: 'mod-one', version: 2, title: 'Module one', summary: 'For tests.',
  defaultVisibility: 'visible', adultIntended: false, isSample: false, statement: 'preferences-not-consent',
  categories: [
    { key: 'a', name: 'Category A', description: 'About A', sensitivity: 'personal', items: [{ key: 'a1', label: 'One' }, { key: 'a2', type: 'text', label: 'Two', sensitivity: 'sensitive', tags: ['t'] }] },
    { key: 'b', name: 'Category B', sensitivity: 'normal', items: [{ key: 'b1', label: 'Three' }] },
  ],
  ...over,
});
const make = (over) => validateTemplate(raw(over)).template;
const adult = () => make({ templateId: 'mod-adult', adultIntended: true, defaultVisibility: 'hidden', categories: [{ key: 'r', name: 'Restricted', sensitivity: 'restricted', items: [{ key: 'r1', label: 'Thing' }] }] });

let counter = 0;
const makeId = (prefix) => { counter += 1; return `${prefix}_t${counter}`; };
const start = () => createStarterProfile({ id: 'p1', now: NOW, title: 'T' });

describe('addModule', () => {
  it('adds categories and items with origin, order, defaults and no answers', () => {
    counter = 0;
    const profile = start();
    const result = addModule(profile, { template: make(), makeId }, LATER);
    expect(result.ok).toBe(true);
    const p = result.profile;
    const added = p.categories.filter((c) => c.origin?.templateId === 'mod-one');
    expect(added.map((c) => [c.name, c.visibility, c.sensitivity, c.parentId, c.origin])).toEqual([
      ['Category A', 'visible', 'personal', null, { templateId: 'mod-one', templateVersion: 2, key: 'a' }],
      ['Category B', 'visible', 'normal', null, { templateId: 'mod-one', templateVersion: 2, key: 'b' }],
    ]);
    expect(added[0].sortOrder).toBeGreaterThan(Math.max(...profile.categories.map((c) => c.sortOrder)));
    expect(added[1].sortOrder).toBeGreaterThan(added[0].sortOrder);
    const items = p.items.filter((i) => i.origin?.templateId === 'mod-one');
    expect(items.map((i) => [i.label, i.type, i.sensitivity, i.origin.key, i.sortOrder])).toEqual([
      ['One', 'state', 'personal', 'a1', 10], ['Two', 'text', 'sensitive', 'a2', 20], ['Three', 'state', 'normal', 'b1', 10],
    ]);
    expect(p.answers).toBe(profile.answers);
    expect(p.metadata.templateIds).toEqual(['starter', 'mod-one']);
    expect(p.updatedAt).toBe(LATER);
    expect(result.categoryIds).toHaveLength(2);
    expect(validateProfile(p).ok).toBe(true);
  });

  it('does not change its input (I-05)', () => {
    const profile = Object.freeze(start());
    expect(() => addModule(profile, { template: make() }, LATER)).not.toThrow();
  });

  it('uses the template default visibility unless told otherwise', () => {
    const hidden = addModule(start(), { template: make({ defaultVisibility: 'hidden' }) }, LATER).profile;
    expect(moduleStatus(hidden, 'mod-one').state).toBe('hidden');
    const shown = addModule(start(), { template: make({ defaultVisibility: 'hidden' }), visibility: 'visible' }, LATER).profile;
    expect(moduleStatus(shown, 'mod-one').state).toBe('on');
  });

  it('refuses a module that is already in the profile', () => {
    const once = addModule(start(), { template: make() }, LATER).profile;
    const again = addModule(once, { template: make() }, LATER);
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already in this profile/);
  });

  it('refuses things that are not templates, and bad visibility', () => {
    for (const template of [null, undefined, {}, 'x', { templateId: 'a' }]) expect(addModule(start(), { template }, LATER).ok).toBe(false);
    expect(addModule(start(), { template: make(), visibility: 'maybe' }, LATER).ok).toBe(false);
  });

  it('never makes an id that is already taken', () => {
    const profile = start();
    const taken = profile.items[0].id;
    const ids = [taken, taken, 'cat_x1', 'item_x1', 'item_x2', 'item_x3'];
    const result = addModule(profile, { template: make(), makeId: () => ids.shift() ?? `n_${counter += 1}` }, LATER);
    expect(result.ok).toBe(true);
    const all = [...result.profile.categories.map((c) => c.id), ...result.profile.items.map((i) => i.id)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives up cleanly if it cannot make a new id', () => {
    const result = addModule(start(), { template: make(), makeId: () => 'starter_hug' }, LATER);
    expect(result.ok).toBe(false);
  });

  it('respects the category and item limits', () => {
    const base = start();
    const fullCategories = { ...base, categories: Array.from({ length: LIMITS.categories }, (_, i) => ({ ...base.categories[0], id: `c${i}` })) };
    expect(addModule(fullCategories, { template: make() }, LATER).error).toMatch(/categories/);
    const fullItems = { ...base, items: Array.from({ length: LIMITS.items }, (_, i) => ({ ...base.items[0], id: `i${i}` })) };
    expect(addModule(fullItems, { template: make() }, LATER).error).toMatch(/items/);
  });

  it('adds every bundled template to one profile, and the result is still valid', () => {
    let profile = start();
    for (const template of TEMPLATES.filter((t) => t.templateId !== 'starter')) {
      const result = addModule(profile, { template, visibility: 'visible', acknowledgeAdult: true }, LATER);
      expect(result.ok, template.templateId).toBe(true);
      profile = result.profile;
    }
    expect(validateProfile(profile).ok).toBe(true);
    expect(profile.categories.length).toBeLessThanOrEqual(LIMITS.categories);
    expect(profile.items.length).toBeLessThanOrEqual(LIMITS.items);
  });
});

describe('setModuleVisibility', () => {
  it('hides and shows a module and keeps its answers', () => {
    let p = addModule(start(), { template: make() }, LATER).profile;
    const itemId = p.items.find((i) => i.origin?.key === 'a1').id;
    p = setItemState(p, { itemId, stateId: 'yes' }, LATER).profile;

    const hidden = setModuleVisibility(p, { template: make(), visibility: 'hidden' }, LATER);
    expect(hidden.ok).toBe(true);
    expect(moduleStatus(hidden.profile, 'mod-one').state).toBe('hidden');
    expect(hidden.profile.answers).toBe(p.answers);
    expect(hidden.profile.items).toBe(p.items);
    expect(getCategoryTree(hidden.profile).flatMap((n) => n.items).some((i) => i.id === itemId)).toBe(false);

    const shown = setModuleVisibility(hidden.profile, { template: make(), visibility: 'visible' }, LATER);
    expect(moduleStatus(shown.profile, 'mod-one').state).toBe('on');
    expect(getCategoryTree(shown.profile).flatMap((n) => n.items).some((i) => i.id === itemId)).toBe(true);
    expect(shown.profile.answers.find((a) => a.itemId === itemId).stateId).toBe('yes');
  });

  it('leaves other modules and the starter alone', () => {
    const p = addModule(start(), { template: make() }, LATER).profile;
    const result = setModuleVisibility(p, { template: make(), visibility: 'hidden' }, LATER).profile;
    expect(result.categories.filter((c) => c.origin.templateId === 'starter').every((c) => c.visibility === 'visible')).toBe(true);
  });

  it('returns the same profile when nothing changes', () => {
    const p = addModule(start(), { template: make() }, LATER).profile;
    expect(setModuleVisibility(p, { template: make(), visibility: 'visible' }, LATER).profile).toBe(p);
  });

  it('fails for a module that is not there, and for bad input', () => {
    expect(setModuleVisibility(start(), { template: make(), visibility: 'hidden' }, LATER).error).toMatch(/not in this profile/);
    expect(setModuleVisibility(start(), { template: null, visibility: 'hidden' }, LATER).ok).toBe(false);
    const p = addModule(start(), { template: make() }, LATER).profile;
    expect(setModuleVisibility(p, { template: make(), visibility: 'x' }, LATER).ok).toBe(false);
  });

  it('shows every category of the module even if only some were hidden', () => {
    let p = addModule(start(), { template: make() }, LATER).profile;
    const first = p.categories.find((c) => c.origin?.key === 'a').id;
    p = { ...p, categories: p.categories.map((c) => (c.id === first ? { ...c, visibility: 'hidden' } : c)) };
    expect(moduleStatus(p, 'mod-one').state).toBe('on');
    const result = setModuleVisibility(p, { template: make(), visibility: 'visible' }, LATER).profile;
    expect(result.categories.filter((c) => c.origin?.templateId === 'mod-one').every((c) => c.visibility === 'visible')).toBe(true);
  });
});

describe('adult-intended modules (D-009)', () => {
  it('can be added hidden without the note, because nothing is shown', () => {
    const result = addModule(start(), { template: adult() }, LATER);
    expect(result.ok).toBe(true);
    expect(moduleStatus(result.profile, 'mod-adult').state).toBe('hidden');
    expect(result.profile.settings.restrictedModulesAcknowledged).toBe(false);
  });

  it('cannot be added visible, or turned on, without the note', () => {
    expect(addModule(start(), { template: adult(), visibility: 'visible' }, LATER).error).toMatch(/note for adults/);
    const hidden = addModule(start(), { template: adult() }, LATER).profile;
    const refused = setModuleVisibility(hidden, { template: adult(), visibility: 'visible' }, LATER);
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/note for adults/);
  });

  it('is turned on once the note is acknowledged, and that is recorded without an age', () => {
    const hidden = addModule(start(), { template: adult() }, LATER).profile;
    const result = setModuleVisibility(hidden, { template: adult(), visibility: 'visible', acknowledgeAdult: true }, LATER);
    expect(result.ok).toBe(true);
    expect(moduleStatus(result.profile, 'mod-adult').state).toBe('on');
    expect(result.profile.settings.restrictedModulesAcknowledged).toBe(true);
    expect(JSON.stringify(result.profile)).not.toMatch(/\bage\b|birth/i);
  });

  it('asks again for each turn-on, but hiding never needs the note', () => {
    const on = addModule(start(), { template: adult(), visibility: 'visible', acknowledgeAdult: true }, LATER).profile;
    const hidden = setModuleVisibility(on, { template: adult(), visibility: 'hidden' }, LATER);
    expect(hidden.ok).toBe(true);
    expect(setModuleVisibility(hidden.profile, { template: adult(), visibility: 'visible' }, LATER).ok).toBe(false);
  });

  it('does not touch the setting for an ordinary module', () => {
    const p = addModule(start(), { template: make() }, LATER).profile;
    expect(p.settings.restrictedModulesAcknowledged).toBe(false);
  });
});

describe('moduleStatus', () => {
  it('reports absent, on and hidden with counts', () => {
    expect(moduleStatus(start(), 'mod-one')).toEqual({ state: 'absent', categories: 0, items: 0 });
    const p = addModule(start(), { template: make() }, LATER).profile;
    expect(moduleStatus(p, 'mod-one')).toEqual({ state: 'on', categories: 2, items: 3 });
    expect(moduleStatus(p, 'starter')).toEqual({ state: 'on', categories: 2, items: 7 });
  });
});
