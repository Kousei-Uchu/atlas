import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import * as cmd from '../../src/domain/commands.js';
import { effectiveStateId, getAnswer, getCategoryTree, effectiveSensitivity, descendantCategoryIds } from '../../src/domain/selectors.js';
import { createHistory, commit, undo, redo, canUndo, canRedo, syncRevision } from '../../src/domain/history.js';
import { LIMITS } from '../../src/domain/limits.js';

const T0 = '2026-10-26T00:00:00.000Z';
const T1 = '2026-10-26T01:00:00.000Z';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
const fresh = () => deepFreeze(createStarterProfile({ id: 'profile_test', now: T0 }));
const mustBeValid = (result) => {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  const v = validateProfile(result.profile);
  expect(v.ok, v.ok ? '' : v.error.problems.join('; ')).toBe(true);
  return deepFreeze(result.profile);
};

describe('selectors and I-01', () => {
  it('resolves a missing answer to Unanswered', () => {
    expect(effectiveStateId(fresh(), 'starter_hug')).toBe('unanswered');
  });
  it('resolves an answer pointing at a missing state to Unanswered, not to anything positive', () => {
    const p = { ...fresh(), answers: [{ itemId: 'starter_hug', stateId: 'ghost', noteShareable: false }] };
    expect(effectiveStateId(p, 'starter_hug')).toBe('unanswered');
  });
  it('takes the higher of item and category sensitivity (D-015)', () => {
    const p = fresh();
    const item = p.items.find((i) => i.id === 'starter_hug'); // item normal, category personal
    expect(effectiveSensitivity(p, item)).toBe('personal');
    expect(effectiveSensitivity(p, { ...item, sensitivity: 'restricted' })).toBe('restricted');
  });
  it('builds a sorted tree and hides hidden categories', () => {
    let p = mustBeValid(cmd.addCategory(fresh(), { id: 'cat_x', name: 'Extra' }, T1));
    expect(getCategoryTree(p).map((n) => n.category.id)).toEqual(['starter_contact', 'starter_communication', 'cat_x']);
    p = { ...p, categories: p.categories.map((c) => (c.id === 'cat_x' ? { ...c, visibility: 'hidden' } : c)) };
    expect(getCategoryTree(p).map((n) => n.category.id)).not.toContain('cat_x');
    expect(getCategoryTree(p, { includeHidden: true }).map((n) => n.category.id)).toContain('cat_x');
  });
});

describe('state commands', () => {
  it('steps from Unanswered one position at a time and never lands on Yes (I-01)', () => {
    const p = fresh();
    const up = mustBeValid(cmd.stepItemState(p, { itemId: 'starter_hug', action: 'secondary' }, T1));
    expect(effectiveStateId(up, 'starter_hug')).toBe('conditional');
    const down = mustBeValid(cmd.stepItemState(p, { itemId: 'starter_hug', action: 'primary' }, T1));
    expect(effectiveStateId(down, 'starter_hug')).toBe('unsure');
  });
  it('honours the primaryDirection and endBehaviour settings', () => {
    let p = { ...fresh(), settings: { ...fresh().settings, interaction: { primaryDirection: 'positive' } } };
    p = deepFreeze(p);
    const r = mustBeValid(cmd.stepItemState(p, { itemId: 'starter_hug', action: 'primary' }, T1));
    expect(effectiveStateId(r, 'starter_hug')).toBe('conditional');
  });
  it('clamps at the end without changing anything, and reports it', () => {
    let p = mustBeValid(cmd.setItemState(fresh(), { itemId: 'starter_hug', stateId: 'yes' }, T1));
    const r = cmd.stepItemState(p, { itemId: 'starter_hug', action: 'secondary' }, T1);
    expect(r).toMatchObject({ ok: true, clamped: true });
    expect(r.profile).toBe(p);
  });
  it('loops when configured', () => {
    let p = mustBeValid(cmd.setItemState(fresh(), { itemId: 'starter_hug', stateId: 'yes' }, T1));
    p = deepFreeze({ ...p, settings: { ...p.settings, cycle: { endBehaviour: 'loop' } } });
    const r = mustBeValid(cmd.stepItemState(p, { itemId: 'starter_hug', action: 'secondary' }, T1));
    expect(effectiveStateId(r, 'starter_hug')).toBe('no');
  });
  it('stepping every state with the picker route reaches all states (non-right-click route)', () => {
    let p = fresh();
    for (const s of p.states) {
      const r = mustBeValid(cmd.setItemState(p, { itemId: 'starter_hug', stateId: s.id }, T1));
      expect(effectiveStateId(r, 'starter_hug')).toBe(s.id);
    }
  });
  it('choosing Unanswered removes the record, or keeps a note-only record (D-012)', () => {
    let p = mustBeValid(cmd.setItemState(fresh(), { itemId: 'starter_hug', stateId: 'yes' }, T1));
    expect(mustBeValid(cmd.setItemState(p, { itemId: 'starter_hug', stateId: 'unanswered' }, T1)).answers).toEqual([]);
    p = mustBeValid(cmd.setItemNote(p, { itemId: 'starter_hug', note: 'Ask first' }, T1));
    const cleared = mustBeValid(cmd.setItemState(p, { itemId: 'starter_hug', stateId: 'unanswered' }, T1));
    expect(getAnswer(cleared, 'starter_hug')).toEqual({ itemId: 'starter_hug', note: 'Ask first', noteShareable: false });
  });
  it('rejects unknown items, unknown states and unselectable states', () => {
    const p = fresh();
    expect(cmd.setItemState(p, { itemId: 'nope', stateId: 'yes' }, T1).ok).toBe(false);
    expect(cmd.setItemState(p, { itemId: 'starter_hug', stateId: 'nope' }, T1).ok).toBe(false);
    const locked = deepFreeze({ ...p, states: p.states.map((s) => (s.id === 'yes' ? { ...s, isSelectable: false } : s)) });
    expect(cmd.setItemState(locked, { itemId: 'starter_hug', stateId: 'yes' }, T1).ok).toBe(false);
  });
  it('treats a no-op as no change (same reference)', () => {
    const p = fresh();
    expect(cmd.setItemState(p, { itemId: 'starter_hug', stateId: 'unanswered' }, T1).profile).toBe(p);
  });
});

describe('notes (I-11)', () => {
  it('keeps notes private by default and only shares a note that exists', () => {
    const p = fresh();
    expect(cmd.setNoteShareable(p, { itemId: 'starter_hug', shareable: true }, T1).ok).toBe(false);
    const withNote = mustBeValid(cmd.setItemNote(p, { itemId: 'starter_hug', note: 'Hello' }, T1));
    expect(getAnswer(withNote, 'starter_hug').noteShareable).toBe(false);
    const shared = mustBeValid(cmd.setNoteShareable(withNote, { itemId: 'starter_hug', shareable: true }, T1));
    expect(getAnswer(shared, 'starter_hug').noteShareable).toBe(true);
  });
  it('resets sharing when the note is cleared, and drops the empty record', () => {
    let p = mustBeValid(cmd.setItemNote(fresh(), { itemId: 'starter_hug', note: 'Hi' }, T1));
    p = mustBeValid(cmd.setNoteShareable(p, { itemId: 'starter_hug', shareable: true }, T1));
    p = mustBeValid(cmd.setItemNote(p, { itemId: 'starter_hug', note: '' }, T1));
    expect(p.answers).toEqual([]);
  });
  it('enforces the note length limit', () => {
    expect(cmd.setItemNote(fresh(), { itemId: 'starter_hug', note: 'x'.repeat(LIMITS.noteLength + 1) }, T1).ok).toBe(false);
  });
});

describe('category and item commands', () => {
  it('adds, renames and trims; rejects empty names and duplicate ids', () => {
    let p = mustBeValid(cmd.addCategory(fresh(), { id: 'cat_a', name: '  Sensory  ' }, T1));
    expect(p.categories.at(-1).name).toBe('Sensory');
    p = mustBeValid(cmd.renameCategory(p, { id: 'cat_a', name: 'Sensory needs' }, T1));
    p = mustBeValid(cmd.addItem(p, { id: 'item_a', categoryId: 'cat_a', label: 'Bright lights' }, T1));
    p = mustBeValid(cmd.renameItem(p, { id: 'item_a', label: 'Bright or flickering lights' }, T1));
    expect(cmd.addCategory(p, { id: 'cat_a', name: 'Dup' }, T1).ok).toBe(false);
    expect(cmd.addCategory(p, { id: 'cat_b', name: '   ' }, T1).ok).toBe(false);
    expect(cmd.addItem(p, { id: 'item_b', categoryId: 'gone', label: 'X' }, T1).ok).toBe(false);
    expect(cmd.addItem(p, { id: 'bad id', categoryId: 'cat_a', label: 'X' }, T1).ok).toBe(false);
  });
  it('limits category depth', () => {
    let p = fresh();
    p = mustBeValid(cmd.addCategory(p, { id: 'l2', name: 'L2', parentId: 'starter_contact' }, T1));
    p = mustBeValid(cmd.addCategory(p, { id: 'l3', name: 'L3', parentId: 'l2' }, T1));
    expect(cmd.addCategory(p, { id: 'l4', name: 'L4', parentId: 'l3' }, T1).ok).toBe(false);
  });
  it('deleting an item removes its answers, overrides and view references', () => {
    let p = mustBeValid(cmd.setItemState(fresh(), { itemId: 'starter_hug', stateId: 'yes' }, T1));
    p = deepFreeze({
      ...p,
      audiences: [{ id: 'aud', name: 'Friends', type: 'friends', description: '', parentId: null }],
      overrides: [{ id: 'ov', itemId: 'starter_hug', audienceId: 'aud', stateId: 'no', enabled: true, explanation: '' }],
      views: [{ id: 'v', name: 'V', audienceId: 'aud', includedItemIds: ['starter_hug', 'starter_call'], includeSensitive: false, restrictedOptInItemIds: ['starter_hug'], includeNotes: false, visualization: { type: 'matrix', options: {} } }],
    });
    expect(validateProfile(p).ok).toBe(true);
    const r = mustBeValid(cmd.deleteItem(p, { id: 'starter_hug' }, T1));
    expect(r.answers).toEqual([]);
    expect(r.overrides).toEqual([]);
    expect(r.views[0].includedItemIds).toEqual(['starter_call']);
    expect(r.views[0].restrictedOptInItemIds).toEqual([]);
  });
  it('deleting a category removes sub-categories, items and answers with no dangling references', () => {
    let p = mustBeValid(cmd.addCategory(fresh(), { id: 'sub', name: 'Sub', parentId: 'starter_contact' }, T1));
    p = mustBeValid(cmd.addItem(p, { id: 'sub_item', categoryId: 'sub', label: 'Nested' }, T1));
    p = mustBeValid(cmd.setItemState(p, { itemId: 'sub_item', stateId: 'no' }, T1));
    p = mustBeValid(cmd.setItemState(p, { itemId: 'starter_text', stateId: 'yes' }, T1));
    expect([...descendantCategoryIds(p, 'starter_contact')].sort()).toEqual(['starter_contact', 'sub']);
    const r = cmd.deleteCategory(p, { id: 'starter_contact' }, T1);
    const after = mustBeValid(r);
    expect(r.removedItems).toBe(5);
    expect(after.categories.map((c) => c.id)).toEqual(['starter_communication']);
    expect(after.answers.map((a) => a.itemId)).toEqual(['starter_text']);
  });
  it('enforces item and category count limits', () => {
    const p = fresh();
    const fullItems = deepFreeze({ ...p, items: Array.from({ length: LIMITS.items }, (_, i) => ({ ...p.items[0], id: `i${i}` })) });
    expect(cmd.addItem(fullItems, { id: 'extra', categoryId: 'starter_contact', label: 'X' }, T1).ok).toBe(false);
  });
  it('updates updatedAt but never revision', () => {
    const r = mustBeValid(cmd.setItemState(fresh(), { itemId: 'starter_hug', stateId: 'yes' }, T1));
    expect(r.updatedAt).toBe(T1);
    expect(r.revision).toBe(0);
  });
});

describe('history (M1-AC-07)', () => {
  const run = (h, result, group) => commit(h, mustBeValid(result), { group });

  it('undoes and redoes state changes and structure edits', () => {
    let h = createHistory(fresh());
    h = run(h, cmd.setItemState(h.present, { itemId: 'starter_hug', stateId: 'yes' }, T1));
    h = run(h, cmd.addCategory(h.present, { id: 'cat_n', name: 'New' }, T1));
    h = run(h, cmd.addItem(h.present, { id: 'item_n', categoryId: 'cat_n', label: 'Thing' }, T1));
    h = run(h, cmd.renameItem(h.present, { id: 'item_n', label: 'Renamed' }, T1));
    h = run(h, cmd.deleteItem(h.present, { id: 'item_n' }, T1));
    for (let i = 0; i < 5; i++) { expect(canUndo(h)).toBe(true); h = undo(h); }
    expect(canUndo(h)).toBe(false);
    expect(h.present).toEqual(fresh());
    for (let i = 0; i < 5; i++) h = redo(h);
    expect(canRedo(h)).toBe(false);
    expect(h.present.items.some((i) => i.id === 'item_n')).toBe(false);
    expect(h.present.categories.some((c) => c.id === 'cat_n')).toBe(true);
  });
  it('deleting a category with items, then undoing, restores everything with no dangling references', () => {
    let h = createHistory(fresh());
    h = run(h, cmd.setItemState(h.present, { itemId: 'starter_hug', stateId: 'yes' }, T1));
    const before = h.present;
    h = run(h, cmd.deleteCategory(h.present, { id: 'starter_contact' }, T1));
    h = undo(h);
    expect(validateProfile(h.present).ok).toBe(true);
    expect(h.present).toEqual(before);
    expect(effectiveStateId(h.present, 'starter_hug')).toBe('yes');
  });
  it('a new edit after undo clears the redo stack', () => {
    let h = createHistory(fresh());
    h = run(h, cmd.setItemState(h.present, { itemId: 'starter_hug', stateId: 'yes' }, T1));
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = run(h, cmd.setItemState(h.present, { itemId: 'starter_hug', stateId: 'no' }, T1));
    expect(canRedo(h)).toBe(false);
  });
  it('groups note edits per field into one undo step, but not across fields', () => {
    let h = createHistory(fresh());
    for (const note of ['A', 'Ab', 'Abc']) h = run(h, cmd.setItemNote(h.present, { itemId: 'starter_hug', note }, T1), 'note:starter_hug');
    expect(h.past).toHaveLength(1);
    h = run(h, cmd.setItemNote(h.present, { itemId: 'starter_call', note: 'Z' }, T1), 'note:starter_call');
    expect(h.past).toHaveLength(2);
    h = undo(h);
    expect(getAnswer(h.present, 'starter_hug').note).toBe('Abc');
    expect(getAnswer(h.present, 'starter_call')).toBeNull();
  });
  it('ignores no-op commits and caps history at the limit', () => {
    let h = createHistory(fresh());
    expect(commit(h, h.present)).toBe(h);
    for (let i = 0; i < 130; i++) h = run(h, cmd.addCategory(h.present, { id: `c${i}`, name: `C${i}` }, T1));
    expect(h.past).toHaveLength(LIMITS.undoHistory);
  });
  it('keeps the live revision through undo and redo so saves never conflict', () => {
    let h = createHistory(fresh());
    h = run(h, cmd.setItemState(h.present, { itemId: 'starter_hug', stateId: 'yes' }, T1));
    h = syncRevision(h, 7);
    expect(h.past).toHaveLength(1); // syncing is not an undo step
    h = undo(h, T1);
    expect(h.present.revision).toBe(7);
    expect(h.present.updatedAt).toBe(T1);
    h = redo(h);
    expect(h.present.revision).toBe(7);
  });
});
