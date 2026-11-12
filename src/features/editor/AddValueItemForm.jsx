// "Add a number, date or choice item" (M8-05, D-072). One small form inside a disclosure so the ordinary
// one-field add stays as it was. It reports upward; the form never edits the profile (I-05).
import { useId, useState } from 'react';
import { LIMITS } from '../../domain/limits.js';
import { ITEM_TYPE_LABELS, planOptions } from '../../domain/item-values.js';
import { newId } from '../../domain/ids.js';

/** @param {{ categoryName: string, onAdd: (args: { label: string, type: string, unit?: string, options?: Array<{id: string, label: string}> }) => boolean }} props */
export function AddValueItemForm({ categoryName, onAdd }) {
  const baseId = useId();
  const [type, setType] = useState('number');
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('');
  const [options, setOptions] = useState('');

  const submit = (event) => {
    event.preventDefault();
    if (label.trim() === '') return;
    const args = { label, type };
    if (type === 'number' && unit.trim() !== '') args.unit = unit;
    if (type === 'choice') args.options = planOptions(null, options.split('\n'), () => newId('opt'));
    if (onAdd(args)) { setLabel(''); setUnit(''); setOptions(''); }
  };

  return (
    <details className="add-value">
      <summary>Add a number, date or choice item to {categoryName}</summary>
      <form className="add-form add-value-form" onSubmit={submit}>
        <label className="field" htmlFor={`${baseId}-t`}>
          <span>Kind of item</span>
          <select id={`${baseId}-t`} value={type} onChange={(event) => setType(event.target.value)}>
            {['number', 'date', 'choice'].map((t) => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={`${baseId}-l`}>
          <span>Name of the new {type} item in {categoryName}</span>
          <input id={`${baseId}-l`} type="text" value={label} maxLength={LIMITS.labelLength} onChange={(event) => setLabel(event.target.value)} />
        </label>
        {type === 'number' && (
          <label className="field" htmlFor={`${baseId}-u`}>
            <span>Unit, if any (for example hours or km)</span>
            <input id={`${baseId}-u`} type="text" value={unit} maxLength={LIMITS.unitLength} onChange={(event) => setUnit(event.target.value)} />
          </label>
        )}
        {type === 'choice' && (
          <label className="field" htmlFor={`${baseId}-o`}>
            <span>Options, one per line (up to {LIMITS.optionsPerItem})</span>
            <textarea id={`${baseId}-o`} rows={4} value={options} onChange={(event) => setOptions(event.target.value)} />
          </label>
        )}
        <button type="submit">Add {type} item</button>
      </form>
    </details>
  );
}
