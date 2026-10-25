// The chart: categories as sections, items as rows (spec 8, 13; M1-11).
//
// Rows are a plain list rather than a CSS-restyled table, so the stacked narrow-screen
// layout keeps its semantics in every browser. Each row still names the item and its
// state in text, so it reads as a matrix to a screen reader.
//
// This component turns user actions into domain commands through `run` and announces
// results. It never edits the profile itself (I-05).
import { useState } from 'react';
import { LIMITS } from '../../domain/limits.js';
import { newId } from '../../domain/ids.js';
import {
  addCategory, addItem, deleteCategory, deleteItem, renameCategory, renameItem,
  setItemNote, setItemState, setItemText, setNoteShareable, stepItemState,
} from '../../domain/commands.js';
import { descendantCategoryIds, effectiveStateId, getAnswer, getCategoryTree, getState } from '../../domain/selectors.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { InlineRename } from './InlineRename.jsx';
import { ItemRow } from './ItemRow.jsx';

/** A one-field "add" form. Clears itself after a successful add. */
function AddForm({ label, buttonLabel, maxLength, onAdd }) {
  const [value, setValue] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (value.trim() === '') return;
    if (onAdd(value)) setValue('');
  };
  return (
    <form className="add-form" onSubmit={submit}>
      <label>
        <span className="visually-hidden">{label}</span>
        <input type="text" value={value} maxLength={maxLength} placeholder={label} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button type="submit">{buttonLabel}</button>
    </form>
  );
}

/**
 * @param {{
 *   profile: import('../../domain/schema.js').Profile,
 *   run: (command: Function, args: object, options?: { group?: string|null }) => { ok: boolean, clamped?: boolean, profile?: object },
 *   announce: (text: string) => void,
 * }} props
 */
export function MatrixView({ profile, run, announce }) {
  const [pending, setPending] = useState(null); // { kind: 'category'|'item', id }

  const stateLabelFor = (nextProfile, itemId) => getState(nextProfile, effectiveStateId(nextProfile, itemId)).label;
  const itemLabelFor = (itemId) => profile.items.find((i) => i.id === itemId)?.label ?? 'Item';

  const onAction = (itemId, kind) => {
    const result = run(stepItemState, { itemId, action: kind });
    if (!result.ok) return;
    const label = itemLabelFor(itemId);
    const state = stateLabelFor(result.profile, itemId);
    announce(result.clamped ? `${label}: already at the end, still ${state}` : `${label}: ${state}`);
  };

  const onSetState = (itemId, stateId) => {
    const result = run(setItemState, { itemId, stateId });
    if (result.ok) announce(`${itemLabelFor(itemId)}: ${stateLabelFor(result.profile, itemId)}`);
  };

  const onSetText = (itemId, text) => { run(setItemText, { itemId, text }, { group: `text:${itemId}` }); };
  const onSetNote = (itemId, note) => { run(setItemNote, { itemId, note }, { group: `note:${itemId}` }); };
  const onSetShareable = (itemId, shareable) => { run(setNoteShareable, { itemId, shareable }); };
  const onRenameItem = (id, label) => { run(renameItem, { id, label }); };

  const onDeleteItem = (id) => {
    // An item with an answer or note asks first; an empty one is covered by Undo.
    const answer = getAnswer(profile, id);
    if (answer) setPending({ kind: 'item', id });
    else confirmDelete({ kind: 'item', id });
  };

  const confirmDelete = ({ kind, id }) => {
    const result = run(kind === 'category' ? deleteCategory : deleteItem, { id });
    if (result.ok) announce(kind === 'category' ? 'Category deleted. You can undo this.' : 'Item deleted. You can undo this.');
    setPending(null);
  };

  const addCategoryNamed = (name) => run(addCategory, { id: newId('category'), name }).ok;
  const addItemNamed = (categoryId, label) => run(addItem, { id: newId('item'), categoryId, label }).ok;

  /** Wording for the delete dialog, stating exactly what goes. */
  const describePending = () => {
    if (pending.kind === 'item') {
      return { title: `Delete “${itemLabelFor(pending.id)}”?`, text: 'This removes the item and its answer and note. You can undo this until you close or reload the page.', confirm: 'Delete item' };
    }
    const doomed = descendantCategoryIds(profile, pending.id);
    const count = profile.items.filter((i) => doomed.has(i.categoryId)).length;
    const name = profile.categories.find((c) => c.id === pending.id)?.name ?? 'category';
    return {
      title: `Delete “${name}”?`,
      text: `This removes the category${doomed.size > 1 ? `, its ${doomed.size - 1} sub-categor${doomed.size === 2 ? 'y' : 'ies'},` : ''} and ${count} item${count === 1 ? '' : 's'} with their answers and notes. You can undo this until you close or reload the page.`,
      confirm: 'Delete category',
    };
  };

  const renderCategory = ({ category, items, children }, depth) => {
    const Heading = `h${Math.min(depth + 1, 4)}`;
    return (
      <section key={category.id} className="category" aria-labelledby={`heading-${category.id}`} data-depth={depth}>
        <div className="category-header">
          <Heading id={`heading-${category.id}`}>{category.name}</Heading>
          <div className="category-actions">
            <InlineRename
              label={`category ${category.name}`}
              value={category.name}
              maxLength={LIMITS.categoryNameLength}
              onSave={(name) => { run(renameCategory, { id: category.id, name }); }}
            />
            <button type="button" className="quiet danger-text" onClick={() => setPending({ kind: 'category', id: category.id })}>
              Delete{' '}<span className="visually-hidden">category {category.name}</span>
            </button>
          </div>
        </div>
        {category.description && <p className="hint">{category.description}</p>}

        {items.length === 0 ? (
          <p className="hint">No items yet.</p>
        ) : (
          <ul className="item-list">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                profile={profile}
                item={item}
                onAction={onAction}
                onSetState={onSetState}
                onSetText={onSetText}
                onSetNote={onSetNote}
                onSetShareable={onSetShareable}
                onRename={onRenameItem}
                onDelete={onDeleteItem}
              />
            ))}
          </ul>
        )}

        <AddForm
          label={`New item in ${category.name}`}
          buttonLabel="Add item"
          maxLength={LIMITS.labelLength}
          onAdd={(label) => addItemNamed(category.id, label)}
        />
        {children.map((child) => renderCategory(child, depth + 1))}
      </section>
    );
  };

  const tree = getCategoryTree(profile);
  const dialog = pending ? describePending() : null;

  return (
    <div className="matrix">
      <p className="hint how-to">
        Click or press Enter or Space on a state to move it one step. Right click, or hold Shift
        with Enter or Space, moves it the other way. Or use the “Set to” menu beside it.
      </p>

      {tree.length === 0 && <p className="empty">There are no categories yet. Add one below to begin.</p>}
      {tree.map((node) => renderCategory(node, 1))}

      <section className="category add-category" aria-label="Add a category">
        <AddForm label="New category name" buttonLabel="Add category" maxLength={LIMITS.categoryNameLength} onAdd={addCategoryNamed} />
      </section>

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          description={dialog.text}
          confirmLabel={dialog.confirm}
          onConfirm={() => confirmDelete(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
