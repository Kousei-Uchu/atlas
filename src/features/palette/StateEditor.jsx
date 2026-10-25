// The edit form for one state. Works on a draft, shows a live preview, and applies the
// whole edit as one undoable command when Save is pressed.
import { useEffect, useId, useRef, useState } from 'react';
import { LIMITS } from '../../domain/limits.js';
import { StateBadge } from '../../components/StateBadge.jsx';
import { ColourField } from './ColourField.jsx';
import { ContrastNote } from './ContrastNote.jsx';
import { ICON_OPTIONS, PATTERN_OPTIONS, SEMANTIC_OPTIONS } from './options.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FIELDS = ['label', 'description', 'color', 'textColor', 'icon', 'pattern', 'semantic'];

/**
 * @param {{
 *   state: import('../../domain/schema.js').State,
 *   onSave: (changes: object) => { ok: boolean, error?: string },
 *   onCancel: () => void,
 * }} props
 */
export function StateEditor({ state, onSave, onCancel }) {
  const id = useId();
  const nameRef = useRef(null);
  const [draft, setDraft] = useState(() => Object.fromEntries(FIELDS.map((k) => [k, state[k]])));
  const [error, setError] = useState(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const set = (key) => (value) => { setDraft((d) => ({ ...d, [key]: value })); setError(null); };
  const onField = (key) => (event) => set(key)(event.target.value);

  const submit = (event) => {
    event.preventDefault();
    const changes = Object.fromEntries(FIELDS.filter((k) => draft[k] !== state[k]).map((k) => [k, draft[k]]));
    if (Object.keys(changes).length === 0) { onCancel(); return; }
    const result = onSave(changes);
    if (!result.ok) setError(result.error);
  };

  // The preview falls back to the saved colour while a typed hex code is incomplete.
  const preview = {
    ...state,
    ...draft,
    color: HEX.test(draft.color) ? draft.color : state.color,
    textColor: HEX.test(draft.textColor) ? draft.textColor : state.textColor,
    label: draft.label.trim() === '' ? state.label : draft.label,
  };

  return (
    // The form handles Escape so the editor closes from any of its fields.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      className="state-editor"
      aria-label={`Edit ${state.label}`}
      onSubmit={submit}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}
    >
      <div className="state-editor-preview" aria-hidden="true"><StateBadge state={preview} /></div>

      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} ref={nameRef} type="text" value={draft.label} maxLength={LIMITS.stateLabelLength} onChange={onField('label')} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-desc`}>Description (optional)</label>
        <textarea id={`${id}-desc`} rows={2} value={draft.description} maxLength={LIMITS.stateDescriptionLength} onChange={onField('description')} />
      </div>

      <div className="field-row">
        <ColourField label="Background colour" value={draft.color} onChange={set('color')} describedBy={`${id}-contrast`} />
        <ColourField label="Text and border colour" value={draft.textColor} onChange={set('textColor')} describedBy={`${id}-contrast`} />
      </div>
      <ContrastNote id={`${id}-contrast`} background={draft.color} foreground={draft.textColor} />

      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-icon`}>Icon</label>
          <select id={`${id}-icon`} value={draft.icon} onChange={onField('icon')}>
            {ICON_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-pattern`}>Pattern</label>
          <select id={`${id}-pattern`} value={draft.pattern ?? 'solid'} onChange={onField('pattern')}>
            {PATTERN_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-meaning`}>Meaning</label>
          <select id={`${id}-meaning`} value={draft.semantic} disabled={state.isSystem} aria-describedby={`${id}-meaning-hint`} onChange={onField('semantic')}>
            {SEMANTIC_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </div>
      </div>
      <p className="hint" id={`${id}-meaning-hint`}>
        {state.isSystem
          ? 'The meaning of a built-in state is fixed.'
          : 'The meaning is used for safety checks only. It does not change the order or the colours.'}
      </p>

      {error && <p className="field-error">{error}</p>}

      <div className="field-actions">
        <button type="submit">Save changes{' '}<span className="visually-hidden">to {state.label}</span></button>
        <button type="button" className="quiet" onClick={onCancel}>Cancel{' '}<span className="visually-hidden">editing {state.label}</span></button>
      </div>
    </form>
  );
}
