// Mature phrasing (D-043): an optional direct wording for module entries, chosen per profile.
// It changes wording only. It never touches an answer, a note, an order, a visibility or a
// sensitivity level, and it never overwrites wording the person changed themselves.
import { describe, it, expect } from 'vitest';
import { createStarterProfile, createDefaultSettings } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import { validateTemplate, wordingOf } from '../../src/domain/templates.js';
import { addModule } from '../../src/domain/module-commands.js';
import { planModuleSync, resetModule, updateModule } from '../../src/domain/module-sync.js';
import { setMaturePhrasing } from '../../src/domain/settings-commands.js';
import { renameItem, setItemNote, setItemState, setItemText } from '../../src/domain/commands.js';
import { TEMPLATES, getTemplate } from '../../src/content/templates/index.js';
import { MATURE_PHRASING_NOTICE } from '../../src/content/notices.js';
import { parseBackupText, serialiseBackup } from '../../src/storage/backup.js';

const NOW = '2026-10-26T10:00:00.000Z';
const LATER = '2026-10-26T11:00:00.000Z';

const raw = (over = {}) => ({
  templateId: 'mod-adult', version: 1, title: 'Adult module', summary: 'For tests.',
  defaultVisibility: 'hidden', adultIntended: true, isSample: false, statement: 'preferences-not-consent',
  categories: [
    {
      key: 'a', name: 'General', description: 'Plain description', sensitivity: 'restricted',
      mature: { name: 'Direct', description: 'Direct description' },
      items: [
        { key: 'a1', label: 'Plain one', mature: { label: 'Direct one' } },
        { key: 'a2', label: 'Same both ways' },
        { key: 'a3', type: 'text', label: 'Prompt', description: 'Write it here.', mature: { label: 'Direct prompt' } },
        { key: 'a4', label: 'Plain four', description: 'Plain note', mature: { label: 'Direct four', description: 'Direct note' } },
      ],
    },
  ],
  ...over,
});
const make = (over) => { const r = validateTemplate(raw(over)); expect(r.ok, JSON.stringify(r.problems)).toBe(true); return r.template; };

const must = (result) => { expect(result.ok, result.error).toBe(true); return result.profile; };
const fresh = () => createStarterProfile({ id: 'p1', now: NOW });
const add = (profile, template, over = {}) => must(addModule(profile, { template, visibility: 'visible', acknowledgeAdult: true, ...over }, NOW));
const item = (profile, key) => profile.items.find((i) => i.origin?.key === key);
const category = (profile) => profile.categories.find((c) => c.origin?.templateId === 'mod-adult');
const turnOn = (profile, template) => must(setMaturePhrasing(profile, { enabled: true, acknowledge: true, templates: [template] }, LATER));
const turnOff = (profile, template) => must(setMaturePhrasing(profile, { enabled: false, templates: [template] }, LATER));

describe('the template format for mature wording', () => {
  it('accepts a mature variant on items and categories, and fills in a description that is left out', () => {
    const t = make();
    expect(t.categories[0].mature).toEqual({ name: 'Direct', description: 'Direct description' });
    expect(t.categories[0].items[0].mature).toEqual({ label: 'Direct one', description: '' });
    expect(t.categories[0].items[2].mature).toEqual({ label: 'Direct prompt', description: 'Write it here.' });
    expect(t.categories[0].items[1].mature).toBeUndefined();
  });

  it('reads the right wording for each phrasing', () => {
    const t = make();
    const [one, same] = t.categories[0].items;
    expect(wordingOf(one, false)).toEqual({ text: 'Plain one', description: '' });
    expect(wordingOf(one, true)).toEqual({ text: 'Direct one', description: '' });
    expect(wordingOf(same, true)).toEqual({ text: 'Same both ways', description: '' });
    expect(wordingOf(t.categories[0], true)).toEqual({ text: 'Direct', description: 'Direct description' });
    expect(wordingOf(t.categories[0], false)).toEqual({ text: 'General', description: 'Plain description' });
    expect(wordingOf(one, undefined)).toEqual({ text: 'Plain one', description: '' });
  });

  it.each([
    ['a mature item wording that matches the plain wording', (t) => { t.categories[0].items[0].mature = { label: 'Plain one' }; }],
    ['a mature category wording that matches the plain wording', (t) => { t.categories[0].mature = { name: 'General', description: 'Plain description' }; }],
    ['an unknown field inside a mature item', (t) => { t.categories[0].items[0].mature.answer = 'yes'; }],
    ['an empty mature label', (t) => { t.categories[0].items[0].mature.label = ''; }],
    ['two items with the same mature label', (t) => { t.categories[0].items[3].mature.label = 'Direct one'; }],
    ['a mature label that matches a different item’s plain label', (t) => { t.categories[0].items[0].mature.label = 'Same both ways'; }],
    ['a template that is not for adults', (t) => { t.adultIntended = false; t.defaultVisibility = 'visible'; t.categories[0].sensitivity = 'normal'; }],
  ])('refuses %s', (_name, change) => {
    const t = raw();
    change(t);
    expect(validateTemplate(t).ok).toBe(false);
  });
});

describe('adding a module', () => {
  it('uses the plain wording when mature phrasing is off, which is the default', () => {
    expect(createDefaultSettings().maturePhrasing).toBe(false);
    const p = add(fresh(), make());
    expect(category(p).name).toBe('General');
    expect(item(p, 'a1').label).toBe('Plain one');
    expect(item(p, 'a4').description).toBe('Plain note');
  });

  it('uses the mature wording when the profile has it on', () => {
    const p0 = fresh();
    const p = add({ ...p0, settings: { ...p0.settings, maturePhrasing: true } }, make());
    expect(category(p).name).toBe('Direct');
    expect(category(p).description).toBe('Direct description');
    expect(item(p, 'a1').label).toBe('Direct one');
    expect(item(p, 'a2').label).toBe('Same both ways');
    expect(item(p, 'a4')).toMatchObject({ label: 'Direct four', description: 'Direct note' });
    expect(item(p, 'a3')).toMatchObject({ label: 'Direct prompt', description: 'Write it here.', type: 'text' });
    expect(p.answers).toEqual([]);
    expect(validateProfile(p).ok).toBe(true);
  });

  it('keeps the same key, version and sensitivity in either phrasing, so update and reset still match', () => {
    const p0 = fresh();
    const plain = add(p0, make());
    const mature = add({ ...p0, settings: { ...p0.settings, maturePhrasing: true } }, make());
    const shape = (p) => p.items.filter((i) => i.origin?.templateId === 'mod-adult').map((i) => [i.origin, i.sensitivity, i.type]);
    expect(shape(mature)).toEqual(shape(plain));
  });
});

describe('setMaturePhrasing', () => {
  it('swaps the wording of every untouched entry and records the setting', () => {
    const t = make();
    const p = turnOn(add(fresh(), t), t);
    expect(p.settings.maturePhrasing).toBe(true);
    expect(p.updatedAt).toBe(LATER);
    expect(category(p)).toMatchObject({ name: 'Direct', description: 'Direct description' });
    expect(item(p, 'a1').label).toBe('Direct one');
    expect(item(p, 'a4')).toMatchObject({ label: 'Direct four', description: 'Direct note' });
    expect(item(p, 'a2').label).toBe('Same both ways');
    expect(validateProfile(p).ok).toBe(true);
  });

  it('goes back to the plain wording when turned off, and the round trip changes nothing else', () => {
    const t = make();
    const start = add(fresh(), t);
    const back = turnOff(turnOn(start, t), t);
    expect({ ...back, settings: { ...back.settings, maturePhrasing: undefined }, updatedAt: 0 }).toEqual({ ...start, settings: { ...start.settings, maturePhrasing: undefined }, updatedAt: 0 });
    expect(back.settings.maturePhrasing).toBe(false);
  });

  it('refuses to turn on without the note, but never needs it to turn off', () => {
    const t = make();
    const p = add(fresh(), t);
    const refused = setMaturePhrasing(p, { enabled: true, templates: [t] }, LATER);
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/note about mature phrasing/);
    const on = turnOn(p, t);
    expect(setMaturePhrasing(on, { enabled: false, templates: [t] }, LATER).ok).toBe(true);
  });

  it('reports how many entries changed, and does nothing when the setting already has that value', () => {
    const t = make();
    const p = add(fresh(), t);
    const on = setMaturePhrasing(p, { enabled: true, acknowledge: true, templates: [t] }, LATER);
    expect(on.changed).toBe(4); // the category, a1, a3 and a4
    const same = setMaturePhrasing(on.profile, { enabled: true, acknowledge: true, templates: [t] }, LATER);
    expect(same.profile).toBe(on.profile);
    expect(same.changed).toBe(0);
  });

  it('never overwrites wording the person changed, and judges each field on its own', () => {
    const t = make();
    let p = add(fresh(), t);
    p = must(renameItem(p, { id: item(p, 'a1').id, label: 'My own words' }, NOW));
    // a4: keep the plain label, but the person has rewritten the description.
    p = { ...p, items: p.items.map((i) => (i.origin?.key === 'a4' ? { ...i, description: 'Something I wrote' } : i)) };
    const on = turnOn(p, t);
    expect(item(on, 'a1').label).toBe('My own words');
    expect(item(on, 'a4')).toMatchObject({ label: 'Direct four', description: 'Something I wrote' });
    const off = turnOff(on, t);
    expect(item(off, 'a1').label).toBe('My own words');
    expect(item(off, 'a4')).toMatchObject({ label: 'Plain four', description: 'Something I wrote' });
  });

  it('leaves answers, notes, text, order, visibility, sensitivity and the person’s own items alone (I-01, I-03)', () => {
    const t = make();
    let p = add(fresh(), t);
    p = must(setItemState(p, { itemId: item(p, 'a1').id, stateId: 'yes' }, NOW));
    p = must(setItemNote(p, { itemId: item(p, 'a1').id, note: 'My note' }, NOW));
    p = must(setItemText(p, { itemId: item(p, 'a3').id, text: 'Words I wrote' }, NOW));
    const before = p;
    const on = turnOn(p, t);
    expect(on.answers).toEqual(before.answers);
    expect(on.states).toEqual(before.states);
    expect(on.overrides).toEqual(before.overrides);
    expect(on.views).toEqual(before.views);
    const strip = (entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => !['label', 'name', 'description'].includes(key)));
    expect(on.items.map(strip)).toEqual(before.items.map(strip));
    expect(on.categories.map(strip)).toEqual(before.categories.map(strip));
    // The starter profile's own sample items are not part of any mature template, so they are not touched.
    const starter = before.items.filter((i) => i.origin?.templateId === 'starter');
    expect(on.items.filter((i) => i.origin?.templateId === 'starter')).toEqual(starter);
  });

  it('ignores entries from a module it was not given, and bad input', () => {
    const t = make();
    const p = add(fresh(), t);
    const result = must(setMaturePhrasing(p, { enabled: true, acknowledge: true, templates: [] }, LATER));
    expect(item(result, 'a1').label).toBe('Plain one');
    expect(result.settings.maturePhrasing).toBe(true);
    expect(setMaturePhrasing(p, { enabled: 'yes', acknowledge: true, templates: [t] }, LATER).ok).toBe(false);
    expect(setMaturePhrasing(p, { enabled: true, acknowledge: true }, LATER).ok).toBe(false);
  });

  it('does not change the input profile (I-05)', () => {
    const t = make();
    const p = add(fresh(), t);
    const snapshot = JSON.stringify(p);
    setMaturePhrasing(p, { enabled: true, acknowledge: true, templates: [t] }, LATER);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('survives a backup and restore', () => {
    const t = make();
    const p = turnOn(add(fresh(), t), t);
    const parsed = parseBackupText(serialiseBackup(p, LATER));
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    expect(parsed.profile.settings.maturePhrasing).toBe(true);
    expect(item(parsed.profile, 'a1').label).toBe('Direct one');
  });

  it('still reads a profile made before the setting existed, and treats it as off', () => {
    const p = fresh();
    const settings = Object.fromEntries(Object.entries(p.settings).filter(([key]) => key !== 'maturePhrasing'));
    const old = { ...p, settings };
    expect('maturePhrasing' in old.settings).toBe(false);
    expect(validateProfile(old).ok).toBe(true);
    const t = make();
    expect(item(add(old, t), 'a1').label).toBe('Plain one');
  });
});

describe('update and reset follow the profile’s phrasing', () => {
  it('does not call mature wording "different" when mature phrasing is on, and does when it is off', () => {
    const t = make();
    const on = turnOn(add(fresh(), t), t);
    expect(planModuleSync(on, t).differing).toEqual([]);
    const offByHand = { ...on, settings: { ...on.settings, maturePhrasing: false } };
    expect(planModuleSync(offByHand, t).differing.map((d) => d.key).sort()).toEqual(['a', 'a1', 'a3', 'a4']);
  });

  it('resets to the mature wording when it is on and to the plain wording when it is off', () => {
    const t = make();
    let p = turnOn(add(fresh(), t), t);
    p = must(renameItem(p, { id: item(p, 'a1').id, label: 'Edited' }, NOW));
    expect(item(must(resetModule(p, { template: t }, LATER)), 'a1').label).toBe('Direct one');
    const plain = turnOff(p, t);
    expect(item(must(resetModule(plain, { template: t }, LATER)), 'a1').label).toBe('Plain one');
  });

  it('adds the new items of a newer version in the phrasing the profile uses', () => {
    const v1 = make();
    const v2 = make({
      version: 2,
      categories: [{
        ...raw().categories[0],
        items: [...raw().categories[0].items, { key: 'a5', label: 'Plain five', mature: { label: 'Direct five' } }],
      }],
    });
    const on = turnOn(add(fresh(), v1), v1);
    expect(item(must(updateModule(on, { template: v2 }, LATER)), 'a5').label).toBe('Direct five');
    const off = add(fresh(), v1);
    expect(item(must(updateModule(off, { template: v2 }, LATER)), 'a5').label).toBe('Plain five');
  });
});

describe('the bundled modules', () => {
  const adultWithMature = TEMPLATES.filter((t) => t.categories.some((c) => c.mature || c.items.some((i) => i.mature)));

  it('add, switch and switch back without losing an item, a key or an answer', () => {
    let p = fresh();
    for (const t of adultWithMature) p = add(p, t, { visibility: 'hidden' });
    const first = p.items.find((i) => i.origin?.templateId === 'intimacy-boundaries' && i.type === 'state');
    p = must(setItemState(p, { itemId: first.id, stateId: 'yes' }, NOW));
    const before = p;
    const on = must(setMaturePhrasing(p, { enabled: true, acknowledge: true, templates: TEMPLATES }, LATER));
    expect(on.items.length).toBe(before.items.length);
    expect(on.items.map((i) => i.origin?.key)).toEqual(before.items.map((i) => i.origin?.key));
    expect(on.answers).toEqual(before.answers);
    expect(validateProfile(on).ok).toBe(true);
    const off = must(setMaturePhrasing(on, { enabled: false, templates: TEMPLATES }, LATER));
    expect(off.items.map((i) => i.label)).toEqual(before.items.map((i) => i.label));
    expect(off.categories.map((c) => c.name)).toEqual(before.categories.map((c) => c.name));
  });

  it('say something direct in mature phrasing, and keep the plain wording general', () => {
    const intimacy = getTemplate('intimacy-boundaries');
    const label = (key, mature) => wordingOf(intimacy.categories.flatMap((c) => c.items).find((i) => i.key === key), mature).text;
    expect(label('acts-mouth-give', false)).toBe('Touching a partner’s private parts with my mouth');
    expect(label('acts-mouth-give', true)).toBe('Giving oral sex to a partner');
    expect(label('acts-front-entered', true)).toMatch(/Vaginal intercourse/);
    expect(label('acts-back-entering', true)).toMatch(/Anal intercourse/);
    expect(label('closeness-more', true)).toMatch(/^Sexual touch/);
    const anatomy = getTemplate('anatomy-compatibility');
    expect(anatomy.categories.map((c) => c.key)).toEqual(expect.arrayContaining(['sex-characteristics', 'private-parts-seen', 'private-parts-touch', 'private-parts-care']));
  });

  it('gives giving and receiving, and each passage, their own item, so no answer implies another', () => {
    const keys = getTemplate('intimacy-boundaries').categories.find((c) => c.key === 'acts').items.map((i) => i.key);
    for (const k of ['acts-mouth-give', 'acts-mouth-receive', 'acts-front-entered', 'acts-front-entering', 'acts-back-entered', 'acts-back-entering', 'acts-fingers-front-give', 'acts-fingers-front-receive', 'acts-fingers-back-give', 'acts-fingers-back-receive']) {
      expect(keys, k).toContain(k);
    }
  });

  it('keeps the mature wording of the anatomy module free of gender words, as the plain wording is (I-10)', () => {
    const anatomy = getTemplate('anatomy-compatibility');
    const text = anatomy.categories.flatMap((c) => [c.mature?.name, c.mature?.description, ...c.items.flatMap((i) => [i.mature?.label, i.mature?.description])]).filter(Boolean).join('\n');
    expect(text.length).toBeGreaterThan(500);
    expect(text).not.toMatch(/\b(men|man|woman|women|male|female|masculine|feminine|boy|boys|girl|girls|trans\w*|non-?binary|genderqueer|agender|he|she|him|her|his|hers)\b/i);
    expect(text).not.toMatch(/\bgender\w*\b/i);
  });

  it('has a note that says plainly what the setting does', () => {
    expect(MATURE_PHRASING_NOTICE).toMatch(/direct words/);
    expect(MATURE_PHRASING_NOTICE).toMatch(/changes wording only/);
    expect(MATURE_PHRASING_NOTICE).toMatch(/for adults/);
  });
});
