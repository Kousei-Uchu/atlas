// The answer palette (spec 5.2, 6; M2): rename, recolour, restyle, reorder, add and remove
// states. Answers refer to states by stable ID, so none of the appearance edits can change
// what anyone answered (I-03). Removal asks what to do with answers that use the state.
//
// This component only turns actions into domain commands through `run`; it never edits the
// profile itself (I-05).
import { useEffect, useId, useRef, useState } from 'react';
import { newId } from '../../domain/ids.js';
import { LIMITS } from '../../domain/limits.js';
import {
  addState, moveStateInCycle, removeState, setStateInCycle, updateState,
} from '../../domain/palette-commands.js';
import { assessStateContrast } from '../../domain/contrast.js';
import { stateUsage } from '../../domain/selectors.js';
import { getCycle } from '../../domain/state-cycle.js';
import { StateBadge } from '../../components/StateBadge.jsx';
import { StateEditor } from './StateEditor.jsx';
import { RemoveStateDialog } from './RemoveStateDialog.jsx';
import { SEMANTIC_OPTIONS } from './options.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function usageText(profile, state) {
  const { answers, overrides } = stateUsage(profile, state.id);
  const parts = [];
  if (answers > 0) parts.push(`used by ${plural(answers, 'answer', 'answers')}`);
  if (overrides > 0) parts.push(`${plural(overrides, 'audience override', 'audience overrides')}`);
  return parts.length > 0 ? parts.join(', ') : 'not used yet';
}

/**
 * @param {{
 *   profile: import('../../domain/schema.js').Profile,
 *   run: (command: Function, args: object, options?: object) => { ok: boolean, error?: string },
 *   announce: (text: string) => void,
 * }} props
 */
export function PalettePanel({ profile, run, announce }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [newName, setNewName] = useState('');
  const [newMeaning, setNewMeaning] = useState('neutral');
  const [newInCycle, setNewInCycle] = useState(false);
  const refocus = useRef(null); // a selector to focus after the next render

  // Keep keyboard focus on the same control after a list reorders or a form closes.
  useEffect(() => {
    if (refocus.current) {
      document.querySelector(refocus.current)?.focus();
      refocus.current = null;
    }
  });

  const cycle = getCycle([...profile.states]);
  const pickerOnly = profile.states.filter((s) => s.cycleOrder === null);

  const onMove = (state, direction) => {
    const result = run(moveStateInCycle, { id: state.id, direction });
    if (!result.ok) return;
    const index = getCycle([...result.profile.states]).findIndex((s) => s.id === state.id);
    const total = cycle.length;
    if (result.moved === false) announce(`${state.label} is already ${direction === 'earlier' ? 'first' : 'last'} in the cycle`);
    else announce(`${state.label} moved ${direction}, now position ${index + 1} of ${total}`);
    refocus.current = `[data-move="${state.id}-${direction}"]:not(:disabled), [data-move="${state.id}-${direction === 'earlier' ? 'later' : 'earlier'}"]:not(:disabled)`;
  };

  const onToggleCycle = (state, inCycle) => {
    const result = run(setStateInCycle, { id: state.id, inCycle });
    if (result.ok) {
      announce(inCycle ? `${state.label} added to the end of the cycle` : `${state.label} taken out of the cycle. It can still be chosen from the menu.`);
      refocus.current = `[data-edit="${state.id}"]`;
    }
  };

  const onSaveEdit = (state, changes) => {
    const result = run(updateState, { id: state.id, changes });
    if (result.ok) {
      announce(`${changes.label ?? state.label} saved`);
      setEditingId(null);
      refocus.current = `[data-edit="${state.id}"]`;
    }
    return result;
  };

  const onAdd = (event) => {
    event.preventDefault();
    if (newName.trim() === '') return;
    const id = newId('state');
    const result = run(addState, { id, label: newName, semantic: newMeaning, inCycle: newInCycle });
    if (!result.ok) return;
    announce(`${newName.trim()} added. Choose its look below.`);
    setNewName('');
    setNewMeaning('neutral');
    setNewInCycle(false);
    setEditingId(id);
  };

  const onRemove = (replacementId) => {
    const state = profile.states.find((s) => s.id === removingId);
    const result = run(removeState, { id: removingId, replacementId });
    if (result.ok) {
      const moved = replacementId ? ' Their answers were moved.' : result.affectedAnswers > 0 ? ' Their answers were cleared.' : '';
      announce(`${state.label} removed.${moved} You can undo this.`);
    }
    setRemovingId(null);
  };

  const renderRow = (state, position) => {
    const editing = editingId === state.id;
    const inCycle = position !== null;
    const contrast = assessStateContrast(state.color, state.textColor);
    return (
      <li key={state.id} className="palette-row" data-state-id={state.id}>
        <div className="palette-row-main">
          {inCycle && <span className="palette-position" aria-hidden="true">{position}</span>}
          <StateBadge state={state} />
          <span className="hint palette-usage">{usageText(profile, state)}{state.isSystem ? ', built in' : ''}</span>
          {contrast?.warn && (
            <span className="contrast-flag" data-level={contrast.level}>
              {contrast.level === 'poor' ? 'Low contrast' : 'Weak contrast'} ({contrast.shown.toFixed(1)} to 1)
            </span>
          )}
        </div>
        <div className="palette-row-actions">
          {inCycle && (
            <>
              <button type="button" className="quiet" data-move={`${state.id}-earlier`} disabled={position === 1} onClick={() => onMove(state, 'earlier')}>
                Move{' '}<span className="visually-hidden">{state.label}</span> earlier
              </button>
              <button type="button" className="quiet" data-move={`${state.id}-later`} disabled={position === cycle.length} onClick={() => onMove(state, 'later')}>
                Move{' '}<span className="visually-hidden">{state.label}</span> later
              </button>
            </>
          )}
          <button type="button" className="quiet" data-edit={state.id} aria-expanded={editing} onClick={() => setEditingId(editing ? null : state.id)}>
            Edit{' '}<span className="visually-hidden">{state.label}</span>
          </button>
          {!state.isUnanswered && (
            <button type="button" className="quiet" onClick={() => onToggleCycle(state, !inCycle)}>
              {inCycle ? 'Take out of cycle' : 'Add to cycle'}{' '}<span className="visually-hidden">{state.label}</span>
            </button>
          )}
          {!state.isSystem && (
            <button type="button" className="quiet danger-text" onClick={() => setRemovingId(state.id)}>
              Remove{' '}<span className="visually-hidden">{state.label}</span>
            </button>
          )}
        </div>
        {editing && (
          <StateEditor
            state={state}
            onSave={(changes) => onSaveEdit(state, changes)}
            onCancel={() => { setEditingId(null); refocus.current = `[data-edit="${state.id}"]`; }}
          />
        )}
      </li>
    );
  };

  return (
    <section className="panel palette" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Answer palette</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide palette editor' : 'Edit palette'}
        </button>
      </div>

      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          <p className="hint">
            Changing a name, colour, icon or order never changes anyone’s answers. Each answer remembers which state
            it uses, not how that state looks.
          </p>

          <h3>Click cycle</h3>
          <p className="hint">
            A click moves an answer exactly one step along this list, in this order. Unanswered is always in the list.
          </p>
          <ol className="palette-list" aria-label="States in the click cycle, in order">
            {cycle.map((state, index) => renderRow(state, index + 1))}
          </ol>

          <h3>Menu only</h3>
          <p className="hint">These states can be chosen from the “Set to” menu but are skipped by clicking.</p>
          {pickerOnly.length === 0 ? (
            <p className="hint">Every state is in the click cycle.</p>
          ) : (
            <ul className="palette-list" aria-label="States that are only in the menu">
              {pickerOnly.map((state) => renderRow(state, null))}
            </ul>
          )}

          <h3>Add a state</h3>
          {profile.states.length >= LIMITS.states ? (
            <p className="hint">A profile can have up to {LIMITS.states} states.</p>
          ) : (
            <form className="add-state-form" onSubmit={onAdd}>
              <div className="field">
                <label htmlFor={`${panelId}-new-name`}>Name of the new state</label>
                <input id={`${panelId}-new-name`} type="text" value={newName} maxLength={LIMITS.stateLabelLength} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`${panelId}-new-meaning`}>Meaning</label>
                <select id={`${panelId}-new-meaning`} value={newMeaning} onChange={(e) => setNewMeaning(e.target.value)}>
                  {SEMANTIC_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={newInCycle} onChange={(e) => setNewInCycle(e.target.checked)} />
                <span>Include it in the click cycle (at the end)</span>
              </label>
              <button type="submit" disabled={newName.trim() === ''}>Add state</button>
            </form>
          )}
        </div>
      )}

      {removingId && (
        <RemoveStateDialog profile={profile} stateId={removingId} onConfirm={onRemove} onCancel={() => setRemovingId(null)} />
      )}
    </section>
  );
}
