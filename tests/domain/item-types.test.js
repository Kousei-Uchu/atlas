import { describe, expect, it } from 'vitest';
import {
  canonicalDate, canonicalNumber, chosenLabels, cleanOptionLabels, hasValue, planOptions, valueText,
} from '../../src/domain/item-values.js';
import {
  addCategory, addItem, deleteItem, setItemChoices, setItemDate, setItemNote, setItemNumber, setItemOptions, setItemState, setItemText,
} from '../../src/domain/commands.js';
import { addAudience, setOverride } from '../../src/domain/audience-commands.js';
import { addView } from '../../src/domain/view-commands.js';
import { buildExportModel } from '../../src/domain/export-model.js';
import { renderMarkdown } from '../../src/export/markdown.js';
import { renderCsv } from '../../src/export/csv.js';
import { renderHtml } from '../../src/export/html.js';
import { validateProfile } from '../../src/domain/validation.js';
import { parseBackupText, serialiseBackup } from '../../src/storage/backup.js';
import { createStarterProfile } from '../../src/domain/defaults.js';

const NOW = '2026-11-12T00:00:00.000Z';
const must = (r) => { expect(r.ok, r.error).toBe(true); return r.profile; };
const OPTS = [{ id: 'opt_a', label: 'Mornings' }, { id: 'opt_b', label: 'Evenings' }, { id: 'opt_c', label: 'Weekends' }];

function base() {
  let p = createStarterProfile({ id: 'p1', title: 'T', now: NOW });
  p = { ...p, categories: [], items: [], answers: [] };
  p = must(addCategory(p, { id: 'cat_1', name: 'Practical', sensitivity: 'normal' }, NOW));
  p = must(addItem(p, { id: 'item_num', categoryId: 'cat_1', label: 'Hours of sleep', type: 'number', unit: 'hours' }, NOW));
  p = must(addItem(p, { id: 'item_date', categoryId: 'cat_1', label: 'Last check-in', type: 'date' }, NOW));
  p = must(addItem(p, { id: 'item_pick', categoryId: 'cat_1', label: 'Good times', type: 'choice', options: OPTS }, NOW));
  p = must(addItem(p, { id: 'item_state', categoryId: 'cat_1', label: 'A state item' }, NOW));
  return p;
}

describe('numbers and dates are kept in one form', () => {
  it('canonicalNumber accepts plain numbers and writes them one way', () => {
    expect(canonicalNumber('42')).toBe('42');
    expect(canonicalNumber(' 007 ')).toBe('7');
    expect(canonicalNumber('3.140')).toBe('3.14');
    expect(canonicalNumber('-0')).toBe('0');
    expect(canonicalNumber('-0.50')).toBe('-0.5');
    expect(canonicalNumber('0.000001')).toBe('0.000001');
    expect(canonicalNumber('1000000000000')).toBe('1000000000000');
  });
  it('canonicalNumber refuses everything else', () => {
    for (const bad of ['', ' ', 'abc', '1e5', '+1', '1,5', '1.', '.5', '0x10', '1.0000001', '1000000000001', '--1', 'Infinity', 'NaN', '1 2', 7, null]) expect(canonicalNumber(bad), String(bad)).toBeNull();
  });
  it('canonicalDate accepts only real calendar dates', () => {
    expect(canonicalDate('2026-11-12')).toBe('2026-11-12');
    expect(canonicalDate('2024-02-29')).toBe('2024-02-29');
    for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-11-00', '2026-11-31', '26-11-12', '2026/11/12', '2026-11-12T00:00', '', null]) expect(canonicalDate(bad), String(bad)).toBeNull();
  });
});

describe('commands', () => {
  it('set and clear a number, a date and choices; empty means Unanswered and stores nothing (I-01)', () => {
    let p = base();
    p = must(setItemNumber(p, { itemId: 'item_num', text: '7.50' }, NOW));
    p = must(setItemDate(p, { itemId: 'item_date', text: '2026-11-12' }, NOW));
    p = must(setItemChoices(p, { itemId: 'item_pick', choiceIds: ['opt_c', 'opt_a'] }, NOW));
    expect(p.answers.find((a) => a.itemId === 'item_num').text).toBe('7.5');
    expect(p.answers.find((a) => a.itemId === 'item_pick').choices).toEqual(['opt_a', 'opt_c']);   // item order, not click order
    expect(validateProfile(p).ok).toBe(true);
    p = must(setItemNumber(p, { itemId: 'item_num', text: '' }, NOW));
    p = must(setItemDate(p, { itemId: 'item_date', text: '  ' }, NOW));
    p = must(setItemChoices(p, { itemId: 'item_pick', choiceIds: [] }, NOW));
    expect(p.answers).toEqual([]);
  });

  it('refuse a wrong value, a wrong type of item, and an unknown option', () => {
    const p = base();
    expect(setItemNumber(p, { itemId: 'item_num', text: 'lots' }, NOW).ok).toBe(false);
    expect(setItemDate(p, { itemId: 'item_date', text: '2026-02-30' }, NOW).ok).toBe(false);
    expect(setItemNumber(p, { itemId: 'item_date', text: '1' }, NOW).error).toMatch(/does not take a number/);
    expect(setItemText(p, { itemId: 'item_num', text: '1' }, NOW).ok).toBe(false);
    expect(setItemState(p, { itemId: 'item_pick', stateId: 'yes' }, NOW).ok).toBe(false);
    expect(setItemChoices(p, { itemId: 'item_pick', choiceIds: ['opt_nope'] }, NOW).ok).toBe(false);
    expect(setItemChoices(p, { itemId: 'item_num', choiceIds: [] }, NOW).ok).toBe(false);
  });

  it('setting the same value again changes nothing (no extra undo step)', () => {
    let p = base();
    p = must(setItemNumber(p, { itemId: 'item_num', text: '5' }, NOW));
    expect(setItemNumber(p, { itemId: 'item_num', text: '5.0' }, NOW).profile).toBe(p);
    p = must(setItemChoices(p, { itemId: 'item_pick', choiceIds: ['opt_a'] }, NOW));
    expect(setItemChoices(p, { itemId: 'item_pick', choiceIds: ['opt_a'] }, NOW).profile).toBe(p);
  });

  it('a note can sit beside a value, and clearing the value keeps the note', () => {
    let p = base();
    p = must(setItemNumber(p, { itemId: 'item_num', text: '6' }, NOW));
    p = must(setItemNote(p, { itemId: 'item_num', note: 'on a good week' }, NOW));
    p = must(setItemNumber(p, { itemId: 'item_num', text: '' }, NOW));
    expect(p.answers).toEqual([{ itemId: 'item_num', note: 'on a good week', noteShareable: false }]);
    expect(validateProfile(p).ok).toBe(true);
  });

  it('addItem checks options and unit for the type', () => {
    const p = base();
    const add = (extra) => addItem(p, { id: 'item_x', categoryId: 'cat_1', label: 'X', ...extra }, NOW);
    expect(add({ type: 'choice' }).ok).toBe(false);
    expect(add({ type: 'choice', options: [] }).ok).toBe(false);
    expect(add({ type: 'choice', options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'a' }] }).error).toMatch(/same name/);
    expect(add({ type: 'choice', options: Array.from({ length: 13 }, (_, i) => ({ id: `o${i}`, label: `L${i}` })) }).ok).toBe(false);
    expect(add({ type: 'state', options: OPTS }).ok).toBe(false);
    expect(add({ type: 'text', unit: 'kg' }).ok).toBe(false);
    expect(add({ type: 'number', unit: 'x'.repeat(21) }).ok).toBe(false);
    expect(add({ type: 'mystery' }).ok).toBe(false);
    expect(add({ type: 'number' }).profile.items.at(-1).unit).toBeUndefined();
  });

  it('setItemOptions keeps the answers for options that stay, and drops those that go', () => {
    let p = base();
    p = must(setItemChoices(p, { itemId: 'item_pick', choiceIds: ['opt_a', 'opt_b'] }, NOW));
    const planned = planOptions(p.items.find((i) => i.id === 'item_pick'), ['Evenings', 'Nights', 'mornings'], () => 'opt_new');
    expect(planned).toEqual([{ id: 'opt_b', label: 'Evenings' }, { id: 'opt_new', label: 'Nights' }, { id: 'opt_a', label: 'mornings' }]);
    p = must(setItemOptions(p, { itemId: 'item_pick', options: planned.slice(0, 2) }, NOW));
    expect(p.answers.find((a) => a.itemId === 'item_pick').choices).toEqual(['opt_b']);
    expect(validateProfile(p).ok).toBe(true);
    p = must(setItemOptions(p, { itemId: 'item_pick', options: [{ id: 'opt_z', label: 'Only' }] }, NOW));
    expect(p.answers.find((a) => a.itemId === 'item_pick')).toBeUndefined();
    expect(setItemOptions(p, { itemId: 'item_pick', options: [] }, NOW).ok).toBe(false);
  });

  it('deleting the item removes its answer; the new types take no audience override', () => {
    let p = base();
    p = must(setItemNumber(p, { itemId: 'item_num', text: '8' }, NOW));
    p = must(addAudience(p, { id: 'aud_1', name: 'Friends', type: 'friends' }, NOW));
    expect(setOverride(p, { id: 'ovr_1', itemId: 'item_num', audienceId: 'aud_1', stateId: 'yes' }, NOW).ok).toBe(false);
    p = must(deleteItem(p, { id: 'item_num' }, NOW));
    expect(p.answers).toEqual([]);
  });
});

describe('words for a value', () => {
  it('valueText shows a number with its unit, a date as is, a choice as labels in item order', () => {
    const p = base();
    const by = (id) => p.items.find((i) => i.id === id);
    expect(valueText(by('item_num'), { text: '7.5' })).toBe('7.5 hours');
    expect(valueText(by('item_date'), { text: '2026-11-12' })).toBe('2026-11-12');
    expect(valueText(by('item_pick'), { choices: ['opt_c', 'opt_a'] })).toBe('Mornings, Weekends');
    expect(valueText(by('item_num'), undefined)).toBe('');
    expect(chosenLabels(by('item_pick'), ['gone'])).toEqual([]);
    expect(hasValue(by('item_pick'), { choices: [] })).toBe(false);
    expect(cleanOptionLabels([' A ', 'a', '', 'B  b'])).toEqual(['A', 'B b']);
  });
});

describe('views and every export carry the new types as plain words, and still hold back what a view holds back', () => {
  const view = (p, include) => {
    const q = must(addView(must(addAudience(p, { id: 'aud_1', name: 'Friends', type: 'friends' }, NOW)), { id: 'view_1', name: 'V', audienceId: 'aud_1' }, NOW));
    return { ...q, views: [{ ...q.views[0], includedItemIds: include }] };
  };
  it('appear in the model, Markdown, CSV and web page', () => {
    let p = base();
    p = must(setItemNumber(p, { itemId: 'item_num', text: '7.5' }, NOW));
    p = must(setItemDate(p, { itemId: 'item_date', text: '2026-11-12' }, NOW));
    p = must(setItemChoices(p, { itemId: 'item_pick', choiceIds: ['opt_a', 'opt_b'] }, NOW));
    const q = view(p, ['item_num', 'item_date', 'item_pick']);
    const { model } = buildExportModel(q, q.views[0], { generatedAt: NOW });
    expect(model.sections[0].items.map((i) => [i.kind, i.text])).toEqual([['text', '7.5 hours'], ['text', '2026-11-12'], ['text', 'Mornings, Evenings']]);
    for (const out of [renderMarkdown(model), renderCsv(model), renderHtml(model)]) {
      expect(out).toContain('7.5 hours');
      expect(out).toContain('Mornings, Evenings');
    }
  });
  it('an unanswered one reads as nothing written, and a restricted one is held back', () => {
    let p = base();
    p = must(addCategory(p, { id: 'cat_r', name: 'Hidden things', sensitivity: 'restricted' }, NOW));
    p = must(addItem(p, { id: 'item_rn', categoryId: 'cat_r', label: 'ZZ-restricted-number', type: 'number' }, NOW));
    p = must(setItemNumber(p, { itemId: 'item_rn', text: '99' }, NOW));
    const q = view(p, ['item_num', 'item_rn']);
    const { model } = buildExportModel(q, q.views[0], { generatedAt: NOW });
    const all = JSON.stringify(model) + renderCsv(model) + renderHtml(model);
    expect(all).not.toContain('ZZ-restricted-number');
    expect(all).not.toContain('99');
    expect(renderCsv(model)).toContain('(nothing written)');
  });
});

describe('integrity and backup', () => {
  it('validation rejects mismatched answers and options on the wrong item', () => {
    const p = base();
    const bad = (patch) => validateProfile({ ...p, ...patch }).ok;
    expect(bad({ answers: [{ itemId: 'item_num', text: '007', noteShareable: false }] })).toBe(false);
    expect(bad({ answers: [{ itemId: 'item_date', text: '2026-02-30', noteShareable: false }] })).toBe(false);
    expect(bad({ answers: [{ itemId: 'item_pick', choices: ['opt_nope'], noteShareable: false }] })).toBe(false);
    expect(bad({ answers: [{ itemId: 'item_pick', choices: ['opt_a', 'opt_a'], noteShareable: false }] })).toBe(false);
    expect(bad({ answers: [{ itemId: 'item_pick', text: 'x', noteShareable: false }] })).toBe(false);
    expect(bad({ answers: [{ itemId: 'item_num', choices: ['opt_a'], noteShareable: false }] })).toBe(false);
    expect(bad({ answers: [{ itemId: 'item_state', stateId: 'yes', choices: ['opt_a'], noteShareable: false }] })).toBe(false);
    expect(bad({ answers: [{ itemId: 'item_num', stateId: 'yes', noteShareable: false }] })).toBe(false);
    expect(bad({ items: p.items.map((i) => (i.id === 'item_state' ? { ...i, options: OPTS } : i)) })).toBe(false);
    expect(bad({ items: p.items.map((i) => (i.id === 'item_state' ? { ...i, unit: 'kg' } : i)) })).toBe(false);
    expect(bad({ items: p.items.map((i) => (i.id === 'item_pick' ? { ...i, options: [] } : i)) })).toBe(false);
    expect(bad({ items: p.items.map((i) => (i.id === 'item_pick' ? { ...i, options: [OPTS[0], OPTS[0]] } : i)) })).toBe(false);
    expect(bad({})).toBe(true);
  });

  it('a profile with every new type survives backup and restore unchanged', () => {
    let p = base();
    p = must(setItemNumber(p, { itemId: 'item_num', text: '7.5' }, NOW));
    p = must(setItemDate(p, { itemId: 'item_date', text: '2026-11-12' }, NOW));
    p = must(setItemChoices(p, { itemId: 'item_pick', choiceIds: ['opt_b'] }, NOW));
    const parsed = parseBackupText(serialiseBackup(p, NOW));
    expect(parsed.ok).toBe(true);
    expect(parsed.profile.items).toEqual(p.items);
    expect(parsed.profile.answers).toEqual(p.answers);
  });
});
