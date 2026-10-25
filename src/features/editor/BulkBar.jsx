// Bulk actions on the selected items (M2-07): set a state, move to a category, replace or
// clear notes. Every action opens a confirmation that says how many items change and how
// many do not, and each one is a single undo step.
//
// Only items that are selected AND currently shown are changed. Items selected earlier and
// then hidden by a search or category filter stay selected but are left alone, and the bar
// says so, so a filter can never widen what a bulk change touches.
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { LIMITS } from '../../domain/limits.js';
import { moveItemsToCategory, setItemsNote, setItemsState } from '../../domain/bulk-commands.js';
import { categoryChoices } from '../../domain/search.js';
import { getAnswer, getCategoryTree } from '../../domain/selectors.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const UNDO_HINT = 'You can undo this until you close or reload the page.';

/**
 * @param {{
 *   profile: object,
 *   ids: string[],
 *   hiddenSelected: number,
 *   onSelectShown: () => void,
 *   onClear: () => void,
 *   run: Function,
 *   announce: (text: string) => void,
 * }} props
 */
export function BulkBar({ profile, ids, hiddenSelected, onSelectShown, onClear, run, announce }) {
  const uid = useId();
  const states = profile.states.filter((s) => s.isSelectable || s.isUnanswered);
  const categories = categoryChoices(getCategoryTree(profile));
  const [stateId, setStateId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [dialog, setDialog] = useState(null); // 'state' | 'category' | 'note'

  const chosenState = states.find((s) => s.id === stateId) ?? null;
  const chosenCategory = categories.find((c) => c.id === categoryId) ?? null;
  const none = ids.length === 0;
  const count = plural(ids.length, 'item', 'items');
  const preview = (command, args) => command(profile, { itemIds: ids, ...args }, profile.updatedAt);

  const openState = () => {
    if (!chosenState) return;
    const result = preview(setItemsState, { stateId: chosenState.id });
    if (result.ok && result.changed === 0) { announce(`No change: every selected item is already ${chosenState.label}, or takes text.`); return; }
    setDialog('state');
  };
  const openCategory = () => {
    if (!chosenCategory) return;
    const result = preview(moveItemsToCategory, { categoryId: chosenCategory.id });
    if (result.ok && result.changed === 0) { announce(`No change: every selected item is already in ${chosenCategory.name}.`); return; }
    setDialog('category');
  };

  const apply = (command, args, message) => {
    setDialog(null);
    const result = run(command, { itemIds: ids, ...args });
    if (result.ok) announce(message(result));
  };

  const describe = () => {
    if (dialog === 'state') {
      const r = preview(setItemsState, { stateId: chosenState.id });
      const parts = [`This sets ${plural(r.changed, 'item', 'items')} to “${chosenState.label}”.`];
      if (r.unchanged > 0) parts.push(`${plural(r.unchanged, 'item is', 'items are')} already ${chosenState.label} and stay as they are.`);
      if (r.skipped > 0) parts.push(`${plural(r.skipped, 'item takes', 'items take')} written text rather than a state and ${r.skipped === 1 ? 'is' : 'are'} skipped.`);
      if (chosenState.semantic === 'positive' || chosenState.semantic === 'conditional') {
        parts.push('Check that this really is your answer for every one of them. A saved answer is a preference, never consent.');
      }
      if (chosenState.isUnanswered) parts.push('Notes on these items are kept.');
      parts.push(UNDO_HINT);
      return { title: `Set ${count} to “${chosenState.label}”?`, text: parts.join(' '), confirm: `Set ${plural(r.changed, 'item', 'items')}` };
    }
    if (dialog === 'category') {
      const r = preview(moveItemsToCategory, { categoryId: chosenCategory.id });
      const parts = [`This moves ${plural(r.changed, 'item', 'items')} to the end of “${chosenCategory.name}”, with their answers and notes.`];
      if (r.unchanged > 0) parts.push(`${plural(r.unchanged, 'item is', 'items are')} already there.`);
      parts.push('Moved items keep at least the sensitivity level they had.', UNDO_HINT);
      return { title: `Move ${count} to “${chosenCategory.name}”?`, text: parts.join(' '), confirm: `Move ${plural(r.changed, 'item', 'items')}` };
    }
    const withNotes = ids.filter((id) => getAnswer(profile, id)?.note).length;
    const clearing = noteText.trim() === '';
    return {
      title: clearing ? `Remove notes from ${count}?` : `Replace notes on ${count}?`,
      text: `${plural(withNotes, 'selected item has', 'selected items have')} a note now, and ${withNotes === 1 ? 'it' : 'they'} will be replaced. Leave the box empty to remove those notes instead. Removing a note also turns off sharing for it. Notes stay private. ${UNDO_HINT}`,
      confirm: clearing ? 'Remove notes' : 'Replace notes',
    };
  };

  const confirmDialog = () => {
    if (dialog === 'state') apply(setItemsState, { stateId: chosenState.id }, (r) => `${plural(r.changed, 'item', 'items')} set to ${chosenState.label}`);
    else if (dialog === 'category') apply(moveItemsToCategory, { categoryId: chosenCategory.id }, (r) => `${plural(r.changed, 'item', 'items')} moved to ${chosenCategory.name}`);
    else apply(setItemsNote, { note: noteText }, (r) => (noteText.trim() === '' ? `Notes removed from ${plural(r.changed, 'item', 'items')}` : `Notes replaced on ${plural(r.changed, 'item', 'items')}`));
  };

  const text = dialog ? describe() : null;
  return (
    <section className="bulk-bar" aria-label="Bulk actions">
      <p className="bulk-count" role="status">
        {none ? 'No items selected.' : `${count} selected.`}
        {hiddenSelected > 0 && ` ${plural(hiddenSelected, 'more is', 'more are')} selected but hidden by the filter, and will not be changed.`}
      </p>
      <div className="bulk-row">
        <button type="button" onClick={onSelectShown}>Select all shown</button>
        <button type="button" onClick={onClear} disabled={ids.length === 0 && hiddenSelected === 0}>Clear selection</button>
      </div>

      <div className="bulk-row">
        <div className="field">
          <label htmlFor={`${uid}-state`}>Set selected to</label>
          <select id={`${uid}-state`} value={stateId} onChange={(e) => setStateId(e.target.value)}>
            <option value="">Choose a state</option>
            {states.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <button type="button" onClick={openState} disabled={none || !chosenState}>Set state…</button>
      </div>

      <div className="bulk-row">
        <div className="field">
          <label htmlFor={`${uid}-category`}>Move selected to</label>
          <select id={`${uid}-category`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{`${'– '.repeat(c.depth)}${c.name}`}</option>)}
          </select>
        </div>
        <button type="button" onClick={openCategory} disabled={none || !chosenCategory}>Move…</button>
      </div>

      <div className="bulk-row">
        <button type="button" onClick={() => { setNoteText(''); setDialog('note'); }} disabled={none}>Change notes…</button>
      </div>

      {dialog && (
        <ConfirmDialog
          title={text.title}
          description={text.text}
          confirmLabel={text.confirm}
          onConfirm={confirmDialog}
          onCancel={() => setDialog(null)}
        >
          {dialog === 'note' && (
            <div className="field">
              <label htmlFor={`${uid}-note`}>Note for the selected items</label>
              <textarea id={`${uid}-note`} rows={3} maxLength={LIMITS.noteLength} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            </div>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
