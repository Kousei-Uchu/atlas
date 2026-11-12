// The answer controls for number, date and choice items (M8-05, D-072). Presentational: each change goes up
// through `onSetValue` and the row never edits the profile (I-05).
//
//   - A number is typed in a plain text box with a numeric keyboard hint, and is checked when the box is left or
//     Enter is pressed, so half-typed text such as "7." is never an error. An empty box means Unanswered.
//   - A date uses the browser's own date field, which also takes typing. An empty field means Unanswered.
//   - A choice is a group of check boxes, one per option. Nothing ticked means Unanswered. Order carries no meaning.
//   - A refusal is written beside the control and also announced once by the page's own error line.
//   - Options are edited as one per line, in a text box, so no drag-and-drop or colour is needed.
import { useEffect, useId, useState } from 'react';
import { LIMITS } from '../../domain/limits.js';
import { planOptions } from '../../domain/item-values.js';
import { newId } from '../../domain/ids.js';

/** @param {{ item: object, answer?: object, onSetValue: (itemId: string, kind: 'number'|'date'|'choices'|'options', value: unknown) => { ok: boolean, error?: string } }} props */
export function ValueControls({ item, answer, onSetValue }) {
  const baseId = useId();
  const [message, setMessage] = useState('');
  const stored = answer?.text ?? '';
  const [draft, setDraft] = useState(stored);
  const [editing, setEditing] = useState(false);
  const [optionText, setOptionText] = useState('');

  // The stored value can change from elsewhere (undo, another control), so the box follows it.
  useEffect(() => { setDraft(stored); setMessage(''); }, [stored]);

  const send = (kind, value) => {
    const result = onSetValue(item.id, kind, value);
    setMessage(result.ok ? '' : result.error);
    return result.ok;
  };

  if (item.type === 'number') {
    const commit = () => { if (draft !== stored && !send('number', draft)) return; };
    return (
      <div className="item-controls value-controls">
        <label htmlFor={`${baseId}-n`} className="visually-hidden">Answer for {item.label}{item.unit ? ` (${item.unit})` : ''}</label>
        <input
          id={`${baseId}-n`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          aria-invalid={message ? 'true' : undefined}
          aria-describedby={message ? `${baseId}-m` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
        />
        {item.unit && <span aria-hidden="true">{item.unit}</span>}
        {message && <p id={`${baseId}-m`} className="hint">{message}</p>}
      </div>
    );
  }

  if (item.type === 'date') {
    return (
      <div className="item-controls value-controls">
        <label htmlFor={`${baseId}-d`} className="visually-hidden">Answer for {item.label}</label>
        <input id={`${baseId}-d`} type="date" value={stored} onChange={(event) => send('date', event.target.value)} />
        {stored !== '' && <button type="button" className="quiet" onClick={() => send('date', '')}>Clear date</button>}
        {message && <p className="hint">{message}</p>}
      </div>
    );
  }

  // choice
  const chosen = new Set(answer?.choices ?? []);
  const toggle = (id, on) => {
    const next = new Set(chosen);
    if (on) next.add(id); else next.delete(id);
    send('choices', [...next]);
  };
  const startEditing = () => { setOptionText((item.options ?? []).map((o) => o.label).join('\n')); setEditing(true); setMessage(''); };
  const saveOptions = () => {
    const labels = optionText.split('\n');
    if (send('options', planOptions(item, labels, () => newId('opt')))) setEditing(false);
  };
  return (
    <div className="item-controls value-controls">
      <fieldset className="choice-group">
        <legend className="visually-hidden">Choices for {item.label}</legend>
        {(item.options ?? []).map((option) => (
          <label key={option.id} className="choice-option">
            <input type="checkbox" checked={chosen.has(option.id)} onChange={(event) => toggle(option.id, event.target.checked)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      {!editing && <button type="button" className="quiet" onClick={startEditing}>Edit options for {item.label}</button>}
      {editing && (
        <div className="choice-editor">
          <label htmlFor={`${baseId}-o`}>Options for {item.label}, one per line (up to {LIMITS.optionsPerItem})</label>
          <textarea id={`${baseId}-o`} rows={Math.min(Math.max((item.options ?? []).length, 3) + 1, 8)} value={optionText} onChange={(event) => setOptionText(event.target.value)} />
          <div className="panel-actions">
            <button type="button" onClick={saveOptions}>Save options</button>
            <button type="button" onClick={() => { setEditing(false); setMessage(''); }}>Cancel</button>
          </div>
        </div>
      )}
      {message && <p className="hint">{message}</p>}
    </div>
  );
}
