// The chart: categories as sections, items as rows (spec 8, 13; M1-11).
//
// Rows are a plain list rather than a CSS-restyled table, so the stacked narrow-screen
// layout keeps its semantics in every browser. Each row still names the item and its
// state in text, so it reads as a matrix to a screen reader.
//
// This component turns user actions into domain commands through `run` and announces
// results. It never edits the profile itself (I-05).
import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '../../domain/limits.js';
import { newId } from '../../domain/ids.js';
import {
  addCategory, addItem, deleteCategory, deleteItem, renameCategory, renameItem,
  setItemNote, setItemState, setItemText, setNoteShareable, stepItemState,
} from '../../domain/commands.js';
import { moveCategory, moveItem } from '../../domain/order-commands.js';
import { categoryChoices, filterTree } from '../../domain/search.js';
import { descendantCategoryIds, effectiveStateId, getAnswer, getCategoryTree, getState } from '../../domain/selectors.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { InlineRename } from './InlineRename.jsx';
import { ItemRow } from './ItemRow.jsx';
import { BulkBar } from './BulkBar.jsx';
import { SearchBar } from './SearchBar.jsx';

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
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]); // item ids; may include items the filter is hiding
  const rootRef = useRef(null);
  const focusAfterMove = useRef(null); // data-move key to refocus once the list has re-rendered

  // Moving a row re-orders the DOM, which can drop keyboard focus. Put it back on the same
  // button, or on the opposite one when this move reached the end and disabled it.
  useEffect(() => {
    const wanted = focusAfterMove.current;
    if (!wanted || !rootRef.current) return;
    focusAfterMove.current = null;
    const find = (key) => rootRef.current.querySelector(`[data-move="${key}"]`);
    const [kind, id, direction] = wanted.split(':');
    const same = find(wanted);
    const other = find(`${kind}:${id}:${direction === 'earlier' ? 'later' : 'earlier'}`);
    (same && !same.disabled ? same : other)?.focus();
  });

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

  const onMove = (kind, id, direction, label) => {
    const result = run(kind === 'category' ? moveCategory : moveItem, { id, direction });
    if (!result.ok) return;
    focusAfterMove.current = `${kind}:${id}:${direction}`;
    announce(result.moved
      ? `${label} moved ${direction === 'earlier' ? 'up' : 'down'}: position ${result.position} of ${result.count}`
      : `${label} is already ${direction === 'earlier' ? 'first' : 'last'}`);
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

  const renderCategory = ({ category, items, children }, depth, siblings, index) => {
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
            {canReorder && (
              <>
                <button
                  type="button"
                  className="quiet"
                  data-move={`category:${category.id}:earlier`}
                  disabled={index === 0}
                  aria-label={`Move category ${category.name} up`}
                  onClick={() => onMove('category', category.id, 'earlier', category.name)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="quiet"
                  data-move={`category:${category.id}:later`}
                  disabled={index === siblings.length - 1}
                  aria-label={`Move category ${category.name} down`}
                  onClick={() => onMove('category', category.id, 'later', category.name)}
                >
                  Down
                </button>
              </>
            )}
            <button type="button" className="quiet danger-text" onClick={() => setPending({ kind: 'category', id: category.id })}>
              Delete{' '}<span className="visually-hidden">category {category.name}</span>
            </button>
          </div>
        </div>
        {category.description && <p className="hint">{category.description}</p>}

        {items.length === 0 ? (
          !filter.active && <p className="hint">No items yet.</p>
        ) : (
          <ul className="item-list">
            {items.map((item, itemIndex) => (
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
                selection={selecting ? { selected: selectedSet.has(item.id), onToggle: toggleSelected } : null}
                order={canReorder ? {
                  canMoveEarlier: itemIndex > 0,
                  canMoveLater: itemIndex < items.length - 1,
                  onMove: (id, direction) => onMove('item', id, direction, item.label),
                } : null}
              />
            ))}
          </ul>
        )}

        {!searching && (
          <AddForm
            label={`New item in ${category.name}`}
            buttonLabel="Add item"
            maxLength={LIMITS.labelLength}
            onAdd={(label) => addItemNamed(category.id, label)}
          />
        )}
        {children.map((child, childIndex) => renderCategory(child, depth + 1, children, childIndex))}
      </section>
    );
  };

  const fullTree = getCategoryTree(profile);
  const choices = categoryChoices(fullTree);
  // A filter for a category that was deleted or hidden is ignored rather than emptying the chart.
  const activeCategory = choices.some((c) => c.id === categoryFilter) ? categoryFilter : '';
  const filter = filterTree(fullTree, { query, categoryId: activeCategory || null });
  const tree = filter.tree;
  const searching = query.trim() !== '';
  // Moving only makes sense when every sibling is on screen, so it is off while filtering.
  const canReorder = !filter.active;
  const summary = !filter.active
    ? `${filter.totalItems} item${filter.totalItems === 1 ? '' : 's'}`
    : `Showing ${filter.itemCount} of ${filter.totalItems} item${filter.totalItems === 1 ? '' : 's'}. Moving and adding items is off while a filter is on.`;
  const shownIds = [];
  const collect = (nodes) => nodes.forEach((n) => { n.items.forEach((i) => shownIds.push(i.id)); collect(n.children); });
  collect(tree);
  const existing = new Set(profile.items.map((i) => i.id));
  const selectedSet = new Set(selected.filter((id) => existing.has(id)));
  const bulkIds = shownIds.filter((id) => selectedSet.has(id));
  const hiddenSelected = selectedSet.size - bulkIds.length;
  function toggleSelected(id, on) {
    setSelected((list) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id)));
  }
  const toggleSelecting = () => { setSelecting((on) => !on); setSelected([]); };
  const clearFilters = () => { setQuery(''); setCategoryFilter(''); };
  const dialog = pending ? describePending() : null;

  return (
    <div className="matrix" ref={rootRef}>
      <p className="hint how-to">
        Click or press Enter or Space on a state to move it one step. Right click, or hold Shift
        with Enter or Space, moves it the other way. Or use the “Set to” menu beside it.
      </p>

      <SearchBar
        query={query}
        categoryId={activeCategory}
        choices={choices}
        summary={summary}
        active={filter.active}
        onQuery={setQuery}
        onCategory={setCategoryFilter}
        onClear={clearFilters}
      />

      <p className="select-toggle">
        <button type="button" aria-pressed={selecting} onClick={toggleSelecting}>{selecting ? 'Stop selecting' : 'Select items'}</button>
      </p>
      {selecting && (
        <BulkBar
          profile={profile}
          ids={bulkIds}
          hiddenSelected={hiddenSelected}
          onSelectShown={() => setSelected((list) => [...new Set([...list, ...shownIds])])}
          onClear={() => setSelected([])}
          run={run}
          announce={announce}
        />
      )}

      {fullTree.length === 0 && <p className="empty">There are no categories yet. Add one below to begin.</p>}
      {fullTree.length > 0 && tree.length === 0 && (
        <p className="empty">
          No items match{searching ? ` “${query.trim()}”` : ' this filter'}. <button type="button" className="quiet" onClick={clearFilters}>Clear filters</button>
        </p>
      )}
      {tree.map((node, index) => renderCategory(node, 1, tree, index))}

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
