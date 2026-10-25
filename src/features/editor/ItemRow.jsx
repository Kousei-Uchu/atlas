// One item row: label, state cell, picker, note, rename and delete.
// Presentational. Every change is reported upward; the row never edits the profile (I-05).
import { useId, useState } from 'react';
import { LIMITS } from '../../domain/limits.js';
import { getAnswer, effectiveStateId, getState, selectableStates } from '../../domain/selectors.js';
import { StatePicker } from '../../components/StatePicker.jsx';
import { StateCell } from './StateCell.jsx';
import { InlineRename } from './InlineRename.jsx';

/**
 * @param {{
 *   profile: import('../../domain/schema.js').Profile,
 *   item: import('../../domain/schema.js').Item,
 *   onAction: (itemId: string, kind: 'primary'|'secondary') => void,
 *   onSetState: (itemId: string, stateId: string) => void,
 *   onSetText: (itemId: string, text: string) => void,
 *   onSetNote: (itemId: string, note: string) => void,
 *   onSetShareable: (itemId: string, shareable: boolean) => void,
 *   onRename: (itemId: string, label: string) => void,
 *   onDelete: (itemId: string) => void,
 * }} props
 */
export function ItemRow({ profile, item, onAction, onSetState, onSetText, onSetNote, onSetShareable, onRename, onDelete }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const noteId = useId();
  const textId = useId();
  const answer = getAnswer(profile, item.id);
  const note = answer?.note ?? '';

  // The picker offers every selectable state plus Unanswered, so the person can also clear an answer.
  const pickerStates = profile.states.filter((s) => s.isSelectable || s.isUnanswered);
  const state = getState(profile, effectiveStateId(profile, item.id));

  return (
    <li className="item-row" data-item-id={item.id}>
      <div className="item-main">
        <span className="item-label">{item.label}</span>
        {item.type === 'state' ? (
          <div className="item-controls">
            <StateCell itemLabel={item.label} state={state} onAction={(kind) => onAction(item.id, kind)} />
            <StatePicker
              itemLabel={item.label}
              value={state.id}
              states={pickerStates.length > 0 ? pickerStates : selectableStates(profile)}
              onChange={(stateId) => onSetState(item.id, stateId)}
            />
          </div>
        ) : (
          <div className="item-controls">
            <label htmlFor={textId} className="visually-hidden">Answer for {item.label}</label>
            <textarea
              id={textId}
              rows={2}
              maxLength={LIMITS.textLength}
              value={answer?.text ?? ''}
              onChange={(event) => onSetText(item.id, event.target.value)}
            />
          </div>
        )}
      </div>

      <div className="item-actions">
        <button
          type="button"
          className="quiet"
          aria-expanded={noteOpen}
          aria-controls={noteId}
          onClick={() => setNoteOpen((open) => !open)}
        >
          {note ? 'Note (added)' : 'Note'}{' '}<span className="visually-hidden">for {item.label}</span>
        </button>
        <InlineRename label={`item ${item.label}`} value={item.label} maxLength={LIMITS.labelLength} onSave={(next) => onRename(item.id, next)} />
        <button type="button" className="quiet danger-text" onClick={() => onDelete(item.id)}>
          Delete{' '}<span className="visually-hidden">item {item.label}</span>
        </button>
      </div>

      {noteOpen && (
        <div className="item-note" id={noteId}>
          <label htmlFor={`${noteId}-text`}>Note for {item.label}</label>
          <textarea
            id={`${noteId}-text`}
            rows={3}
            maxLength={LIMITS.noteLength}
            value={note}
            onChange={(event) => onSetNote(item.id, event.target.value)}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={answer?.noteShareable === true}
              disabled={note === ''}
              onChange={(event) => onSetShareable(item.id, event.target.checked)}
            />
            <span>Allow this note to be included when I choose to share selected items</span>
          </label>
          <p className="hint">Notes stay private unless you turn this on and include notes in an export.</p>
        </div>
      )}
    </li>
  );
}
