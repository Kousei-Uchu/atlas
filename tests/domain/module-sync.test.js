import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import { validateTemplate } from '../../src/domain/templates.js';
import { addModule, moduleStatus, setModuleVisibility } from '../../src/domain/module-commands.js';
import { planModuleSync, resetModule, updateModule } from '../../src/domain/module-sync.js';
import { addItem, deleteCategory, deleteItem, renameItem, setItemNote, setItemState, setItemText } from '../../src/domain/commands.js';
import { LIMITS } from '../../src/domain/limits.js';
import { TEMPLATES } from '../../src/content/templates/index.js';

const NOW = '2026-10-26T10:00:00.000Z';
const LATER = '2026-10-26T11:00:00.000Z';

const base = (over = {}) => ({
  templateId: 'mod-one', version: 1, title: 'Module one', summary: 'For tests.',
  defaultVisibility: 'visible', adultIntended: false, isSample: false, statement: 'preferences-not-consent',
  categories: [
    { key: 'a', name: 'Category A', description: 'About A', sensitivity: 'personal', items: [{ key: 'a1', label: 'One' }, { key: 'a2', type: 'text', label: 'Two' }, { key: 'a3', label: 'Three', tags: ['t'] }] },
    { key: 'b', name: 'Category B', sensitivity: 'normal', items: [{ key: 'b1', label: 'Four' }] },
  ],
  ...over,
});
const make = (over) => validateTemplate(base(over)).template;
const v1 = () => make();
// Version 2: a new item in A, a new category C, the wording of a1 changed, a3 dropped from the template.
const v2 = () => make({
  version: 2,
  categories: [
    { key: 'a', name: 'Category A', description: 'About A', sensitivity: 'personal', items: [{ key: 'a1', label: 'One, reworded' }, { key: 'a2', type: 'text', label: 'Two' }, { key: 'a4', label: 'Five' }] },
    { key: 'b', name: 'Category B', sensitivity: 'normal', items: [{ key: 'b1', label: 'Four' }] },
    { key: 'c', name: 'Category C', sensitivity: 'sensitive', items: [{ key: 'c1', label: 'Six' }, { key: 'c2', label: 'Seven' }] },
  ],
});

let counter = 0;
const makeId = (prefix) => { counter += 1; return `${prefix}_s${counter}`; };
const must = (result) => { expect(result.ok, result.error).toBe(true); return result.profile; };
const start = () => must(addModule(createStarterProfile({ id: 'p1', now: NOW }), { template: v1(), makeId }, NOW));
const byKey = (profile, key) => profile.items.find((i) => i.origin?.key === key);
const catByKey = (profile, key) => profile.categories.find((c) => c.origin?.templateId === 'mod-one' && c.origin.key === key);
const inCategory = (profile, categoryKey) => profile.items.filter((i) => i.categoryId === catByKey(profile, categoryKey).id).sort((a, b) => a.sortOrder - b.sortOrder);

/** A profile with answers and notes on the module, so tests can show they survive. */
function answered() {
  let p = start();
  p = must(setItemState(p, { itemId: byKey(p, 'a1').id, stateId: 'yes' }, NOW));
  p = must(setItemState(p, { itemId: byKey(p, 'a3').id, stateId: 'no' }, NOW));
  p = must(setItemText(p, { itemId: byKey(p, 'a2').id, text: 'My own words' }, NOW));
  p = must(setItemNote(p, { itemId: byKey(p, 'b1').id, note: 'A private note' }, NOW));
  return p;
}

describe('planModuleSync', () => {
  it('says the module is absent when nothing in the profile comes from it', () => {
    const plan = planModuleSync(createStarterProfile({ id: 'p1', now: NOW }), v1());
    expect(plan).toMatchObject({ present: false, updateAvailable: false, addCategories: [], addItems: [], differing: [], retired: 0 });
  });

  it('finds nothing to do when the profile matches its template', () => {
    const plan = planModuleSync(start(), v1());
    expect(plan).toMatchObject({ present: true, installedVersion: 1, latestVersion: 1, updateAvailable: false, newerInProfile: false });
    expect(plan.addCategories).toEqual([]);
    expect(plan.addItems).toEqual([]);
    expect(plan.differing).toEqual([]);
    expect(plan.retired).toBe(0);
  });

  it('lists what a newer version adds, what differs, and what the template no longer has', () => {
    const plan = planModuleSync(start(), v2());
    expect(plan.updateAvailable).toBe(true);
    expect(plan.installedVersion).toBe(1);
    expect(plan.latestVersion).toBe(2);
    expect(plan.addCategories).toEqual([{ key: 'c', name: 'Category C', items: 2 }]);
    expect(plan.addItems).toEqual([{ key: 'a4', label: 'Five', category: 'Category A' }]);
    expect(plan.differing).toEqual([{ kind: 'item', key: 'a1', name: 'One' }]);
    expect(plan.retired).toBe(1);
  });

  it('counts wording the person changed as differing, and does not change the profile', () => {
    let p = start();
    p = must(renameItem(p, { id: byKey(p, 'b1').id, label: 'My own wording' }, NOW));
    const frozen = JSON.stringify(p);
    const plan = planModuleSync(p, v1());
    expect(plan.differing).toEqual([{ kind: 'item', key: 'b1', name: 'My own wording' }]);
    expect(JSON.stringify(p)).toBe(frozen);
  });

  it('flags a profile that holds a newer version than the app knows', () => {
    const plan = planModuleSync(must(addModule(createStarterProfile({ id: 'p1', now: NOW }), { template: v2(), makeId }, NOW)), v1());
    expect(plan.newerInProfile).toBe(true);
  });

  it('copes with a template that is missing or malformed', () => {
    const p = start();
    for (const bad of [null, undefined, {}, 'x']) expect(planModuleSync(p, bad).present).toBe(false);
  });
});

describe('updateModule', () => {
  it('adds the new category and item, and records the new version on everything', () => {
    const p = answered();
    const result = updateModule(p, { template: v2(), makeId }, LATER);
    expect(result.ok).toBe(true);
    expect(result.added).toEqual({ categories: 1, items: 3 });
    const u = result.profile;
    expect(inCategory(u, 'a').map((i) => i.label)).toEqual(['One', 'Two', 'Three', 'Five']);
    expect(catByKey(u, 'c').origin.templateVersion).toBe(2);
    expect(u.items.filter((i) => i.origin?.templateId === 'mod-one').every((i) => i.origin.templateVersion === 2)).toBe(true);
    expect(u.categories.filter((c) => c.origin?.templateId === 'mod-one').every((c) => c.origin.templateVersion === 2)).toBe(true);
    expect(u.updatedAt).toBe(LATER);
    expect(validateProfile(u).ok).toBe(true);
    expect(planModuleSync(u, v2()).updateAvailable).toBe(false);
  });

  it('keeps every answer and note exactly as they were (I-01, D-011)', () => {
    const p = answered();
    const u = must(updateModule(p, { template: v2(), makeId }, LATER));
    expect(u.answers).toBe(p.answers);
  });

  it('keeps wording the person changed, and wording the template changed, until a reset', () => {
    let p = answered();
    p = must(renameItem(p, { id: byKey(p, 'b1').id, label: 'My own wording' }, NOW));
    const u = must(updateModule(p, { template: v2(), makeId }, LATER));
    expect(byKey(u, 'b1').label).toBe('My own wording');
    expect(byKey(u, 'a1').label).toBe('One');
  });

  it('keeps entries the template no longer has, and the person\u2019s own items', () => {
    let p = answered();
    p = must(addItem(p, { id: 'item_mine', categoryId: catByKey(p, 'a').id, label: 'Mine' }, NOW));
    const u = must(updateModule(p, { template: v2(), makeId }, LATER));
    expect(byKey(u, 'a3')).toBeTruthy();
    expect(u.items.some((i) => i.id === 'item_mine')).toBe(true);
    expect(u.items.find((i) => i.id === 'item_mine').origin).toBeNull();
  });

  it('puts a new item at the end of its category, after the person\u2019s own', () => {
    let p = answered();
    p = must(addItem(p, { id: 'item_mine', categoryId: catByKey(p, 'a').id, label: 'Mine' }, NOW));
    const u = must(updateModule(p, { template: v2(), makeId }, LATER));
    expect(inCategory(u, 'a').map((i) => i.label)).toEqual(['One', 'Two', 'Three', 'Mine', 'Five']);
  });

  it('shows new categories while the module is on, and hides them while it is hidden', () => {
    const on = must(updateModule(answered(), { template: v2(), makeId }, LATER));
    expect(catByKey(on, 'c').visibility).toBe('visible');
    const hidden = must(setModuleVisibility(answered(), { template: v1(), visibility: 'hidden' }, NOW));
    const u = must(updateModule(hidden, { template: v2(), makeId }, LATER));
    expect(catByKey(u, 'c').visibility).toBe('hidden');
    expect(moduleStatus(u, 'mod-one').state).toBe('hidden');
  });

  it('never makes a new category visible in an adult-intended module whose note was not acknowledged', () => {
    const adultV = (version, extra = []) => make({
      templateId: 'mod-adult', version, adultIntended: true, defaultVisibility: 'hidden',
      categories: [{ key: 'r', name: 'Restricted', sensitivity: 'restricted', items: [{ key: 'r1', label: 'Thing' }] }, ...extra],
    });
    let p = must(addModule(createStarterProfile({ id: 'p1', now: NOW }), { template: adultV(1), visibility: 'visible', acknowledgeAdult: true, makeId }, NOW));
    // An imported or edited profile could show the module without the acknowledgement being recorded.
    p = { ...p, settings: { ...p.settings, restrictedModulesAcknowledged: false } };
    const more = { key: 'r2', name: 'More restricted', sensitivity: 'restricted', items: [{ key: 'r3', label: 'Another' }] };
    const u = must(updateModule(p, { template: adultV(2, [more]), makeId }, LATER));
    expect(u.categories.find((c) => c.origin?.key === 'r2').visibility).toBe('hidden');
    // With the acknowledgement recorded, the module's own state decides.
    const q = { ...p, settings: { ...p.settings, restrictedModulesAcknowledged: true } };
    expect(must(updateModule(q, { template: adultV(2, [more]), makeId }, LATER)).categories.find((c) => c.origin?.key === 'r2').visibility).toBe('visible');
  });

  it('is a no-op when there is no newer version, and returns the same profile', () => {
    const p = answered();
    const result = updateModule(p, { template: v1(), makeId }, LATER);
    expect(result.ok).toBe(true);
    expect(result.profile).toBe(p);
    expect(result.added).toEqual({ categories: 0, items: 0 });
  });

  it('does not touch anything outside the module', () => {
    const p = answered();
    const u = must(updateModule(p, { template: v2(), makeId }, LATER));
    const outside = (list) => list.filter((e) => e.origin?.templateId !== 'mod-one');
    expect(outside(u.categories)).toEqual(outside(p.categories));
    expect(outside(u.items)).toEqual(outside(p.items));
    expect(u.states).toBe(p.states);
    expect(u.settings).toBe(p.settings);
  });

  it('refuses a module that is not there, a bad template, and a profile newer than the app', () => {
    const bare = createStarterProfile({ id: 'p1', now: NOW });
    expect(updateModule(bare, { template: v2(), makeId }, LATER)).toEqual({ ok: false, error: 'That module is not in this profile.' });
    expect(updateModule(bare, { template: null, makeId }, LATER).ok).toBe(false);
    const newer = must(addModule(bare, { template: v2(), makeId }, NOW));
    expect(updateModule(newer, { template: v1(), makeId }, LATER).error).toMatch(/newer version/);
  });

  it('refuses when the new entries would pass the profile limits, and changes nothing', () => {
    const p = answered();
    const crowded = { ...p, items: [...p.items, ...Array.from({ length: LIMITS.items - p.items.length - 1 }, (_, n) => ({ ...p.items[0], id: `item_fill${n}`, origin: null }))] };
    const result = updateModule(crowded, { template: v2(), makeId }, LATER);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/up to 2000 items/);
  });

  it('refuses when it cannot make an identifier, rather than looping', () => {
    const result = updateModule(answered(), { template: v2(), makeId: () => 'not a valid id!' }, LATER);
    expect(result).toEqual({ ok: false, error: 'Could not make a new identifier. Try again.' });
  });

  it('does not change the profile it is given (I-05)', () => {
    const p = answered();
    const before = JSON.stringify(p);
    updateModule(p, { template: v2(), makeId }, LATER);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('resetModule', () => {
  it('puts the template\u2019s wording back and keeps every answer and note', () => {
    let p = answered();
    p = must(renameItem(p, { id: byKey(p, 'b1').id, label: 'My own wording' }, NOW));
    const result = resetModule(p, { template: v1(), makeId }, LATER);
    expect(result.ok).toBe(true);
    expect(byKey(result.profile, 'b1').label).toBe('Four');
    expect(result.restored).toBe(1);
    expect(result.added).toEqual({ categories: 0, items: 0 });
    expect(result.profile.answers).toBe(p.answers);
    expect(validateProfile(result.profile).ok).toBe(true);
  });

  it('keeps the same item ids, so answers stay attached to the same items', () => {
    const p = answered();
    const ids = (list) => list.map((i) => i.id).sort();
    const r = must(resetModule(p, { template: v2(), makeId }, LATER));
    for (const id of ids(p.items)) expect(r.items.some((i) => i.id === id)).toBe(true);
    expect(r.answers.every((a) => r.items.some((i) => i.id === a.itemId))).toBe(true);
  });

  it('brings back what was deleted, and gives it no answer', () => {
    let p = answered();
    p = must(deleteItem(p, { id: byKey(p, 'a1').id }, NOW));
    p = must(deleteCategory(p, { id: catByKey(p, 'b').id }, NOW));
    const result = resetModule(p, { template: v1(), makeId }, LATER);
    expect(result.added).toEqual({ categories: 1, items: 2 });
    const r = result.profile;
    expect(inCategory(r, 'a').map((i) => i.label)).toEqual(['One', 'Two', 'Three']);
    expect(r.answers.find((a) => a.itemId === byKey(r, 'a1').id)).toBeUndefined();
    expect(r.answers.find((a) => a.itemId === byKey(r, 'b1').id)).toBeUndefined();
  });

  it('applies a newer template in full: new entries, new wording, new version', () => {
    const r = must(resetModule(answered(), { template: v2(), makeId }, LATER));
    expect(byKey(r, 'a1').label).toBe('One, reworded');
    expect(byKey(r, 'a4')).toBeTruthy();
    expect(catByKey(r, 'c')).toBeTruthy();
    expect(r.items.filter((i) => i.origin?.templateId === 'mod-one').every((i) => i.origin.templateVersion === 2)).toBe(true);
  });

  it('leaves entries the template no longer has, and the person\u2019s own items, where they are', () => {
    let p = answered();
    p = must(addItem(p, { id: 'item_mine', categoryId: catByKey(p, 'a').id, label: 'Mine' }, NOW));
    const r = must(resetModule(p, { template: v2(), makeId }, LATER));
    expect(byKey(r, 'a3').label).toBe('Three');
    expect(r.items.find((i) => i.id === 'item_mine').label).toBe('Mine');
    // Template items come first in the template's order, then everything else.
    expect(inCategory(r, 'a').map((i) => i.label)).toEqual(['One, reworded', 'Two', 'Five', 'Three', 'Mine']);
  });

  it('restores the template\u2019s order within a category and renumbers 10, 20, 30', () => {
    let p = answered();
    const a = inCategory(p, 'a');
    p = { ...p, items: p.items.map((i) => (i.id === a[0].id ? { ...i, sortOrder: 99 } : i)) };
    const r = must(resetModule(p, { template: v1(), makeId }, LATER));
    expect(inCategory(r, 'a').map((i) => [i.label, i.sortOrder])).toEqual([['One', 10], ['Two', 20], ['Three', 30]]);
  });

  it('restores the order of the module\u2019s categories among themselves and leaves other categories where they are', () => {
    const p = answered();
    const a = catByKey(p, 'a');
    const b = catByKey(p, 'b');
    const swapped = { ...p, categories: p.categories.map((c) => (c.id === a.id ? { ...c, sortOrder: b.sortOrder } : c.id === b.id ? { ...c, sortOrder: a.sortOrder } : c)) };
    const r = must(resetModule(swapped, { template: v1(), makeId }, LATER));
    expect(catByKey(r, 'a').sortOrder).toBe(a.sortOrder);
    expect(catByKey(r, 'b').sortOrder).toBe(b.sortOrder);
    const outside = (list) => list.filter((c) => c.origin?.templateId !== 'mod-one');
    expect(outside(r.categories)).toEqual(outside(p.categories));
  });

  it('never lowers a sensitivity level, and raises one that the template raised (D-032)', () => {
    let p = answered();
    p = { ...p, items: p.items.map((i) => (i.origin?.key === 'a1' ? { ...i, sensitivity: 'restricted' } : i)) };
    p = { ...p, categories: p.categories.map((c) => (c.origin?.key === 'b' ? { ...c, sensitivity: 'sensitive' } : c)) };
    const raised = make({ categories: [
      { key: 'a', name: 'Category A', description: 'About A', sensitivity: 'personal', items: [{ key: 'a1', label: 'One' }, { key: 'a2', type: 'text', label: 'Two' }, { key: 'a3', label: 'Three', tags: ['t'], sensitivity: 'sensitive' }] },
      { key: 'b', name: 'Category B', sensitivity: 'normal', items: [{ key: 'b1', label: 'Four' }] },
    ] });
    const r = must(resetModule(p, { template: raised, makeId }, LATER));
    expect(byKey(r, 'a1').sensitivity).toBe('restricted');
    expect(catByKey(r, 'b').sensitivity).toBe('sensitive');
    expect(byKey(r, 'a3').sensitivity).toBe('sensitive');
  });

  it('never changes an item\u2019s type, so an answer never stops fitting its item', () => {
    const p = answered();
    const retyped = make({ categories: [
      { key: 'a', name: 'Category A', description: 'About A', sensitivity: 'personal', items: [{ key: 'a1', type: 'text', label: 'One' }, { key: 'a2', label: 'Two' }, { key: 'a3', label: 'Three', tags: ['t'] }] },
      { key: 'b', name: 'Category B', sensitivity: 'normal', items: [{ key: 'b1', label: 'Four' }] },
    ] });
    const r = must(resetModule(p, { template: retyped, makeId }, LATER));
    expect(byKey(r, 'a1').type).toBe('state');
    expect(byKey(r, 'a2').type).toBe('text');
    expect(validateProfile(r).ok).toBe(true);
  });

  it('keeps hidden categories hidden and shown categories shown', () => {
    const p = answered();
    const hiddenA = { ...p, categories: p.categories.map((c) => (c.origin?.key === 'a' ? { ...c, visibility: 'hidden' } : c)) };
    const r = must(resetModule(hiddenA, { template: v1(), makeId }, LATER));
    expect(catByKey(r, 'a').visibility).toBe('hidden');
    expect(catByKey(r, 'b').visibility).toBe('visible');
  });

  it('works on a template that matches already, changing nothing but the time', () => {
    const p = answered();
    const result = resetModule(p, { template: v1(), makeId }, LATER);
    expect(result.restored).toBe(0);
    expect(result.profile.items).toEqual(p.items);
    expect(result.profile.categories).toEqual(p.categories);
  });

  it('does not touch anything outside the module, and does not change the profile it is given (I-05)', () => {
    const p = answered();
    const before = JSON.stringify(p);
    const r = must(resetModule(p, { template: v2(), makeId }, LATER));
    expect(JSON.stringify(p)).toBe(before);
    const outside = (list) => list.filter((e) => e.origin?.templateId !== 'mod-one');
    expect(outside(r.items)).toEqual(outside(p.items));
    expect(r.settings).toBe(p.settings);
    expect(r.states).toBe(p.states);
  });

  it('refuses a missing module, a missing template, a profile newer than the app, and a full profile', () => {
    const bare = createStarterProfile({ id: 'p1', now: NOW });
    expect(resetModule(bare, { template: v1(), makeId }, LATER).ok).toBe(false);
    expect(resetModule(answered(), { template: null, makeId }, LATER).ok).toBe(false);
    expect(resetModule(must(addModule(bare, { template: v2(), makeId }, NOW)), { template: v1(), makeId }, LATER).error).toMatch(/newer version/);
    const p = answered();
    const crowded = { ...p, categories: [...p.categories, ...Array.from({ length: LIMITS.categories - p.categories.length }, (_, n) => ({ ...p.categories[0], id: `cat_fill${n}`, origin: null }))] };
    expect(resetModule(crowded, { template: v2(), makeId }, LATER).error).toMatch(/up to 200 categories/);
  });
});

describe('real templates', () => {
  it('reset on an untouched module changes nothing, for every template in the catalogue', () => {
    for (const template of TEMPLATES.filter((t) => !t.isSample)) {
      const p = must(addModule(createStarterProfile({ id: 'p1', now: NOW }), { template, visibility: 'hidden', acknowledgeAdult: true, makeId }, NOW));
      const result = resetModule(p, { template, makeId }, LATER);
      expect(result.ok, template.templateId).toBe(true);
      expect(result.restored, template.templateId).toBe(0);
      expect(result.added, template.templateId).toEqual({ categories: 0, items: 0 });
      expect(result.profile.items, template.templateId).toEqual(p.items);
      expect(updateModule(p, { template, makeId }, LATER).profile, template.templateId).toBe(p);
    }
  });
});
