// A labelled native <select> that can set any state directly (D-021, M1-AC-04).
// It works with keyboard, touch (native picker on phones) and assistive technology,
// so no one needs a right click to reach any state.
import { useId } from 'react';

/**
 * @param {{
 *   itemLabel: string,
 *   value: string,
 *   states: import('../domain/schema.js').State[],
 *   onChange: (stateId: string) => void,
 * }} props
 * `states` should already be limited to the choices to offer, in cycle-friendly order.
 */
export function StatePicker({ itemLabel, value, states, onChange }) {
  const id = useId();
  return (
    <div className="state-picker">
      <label htmlFor={id} className="state-picker-label">
        <span className="visually-hidden">Choose a state for {itemLabel}</span>
        <span aria-hidden="true">Set to</span>
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {states.map((state) => (
          <option key={state.id} value={state.id}>{state.label}</option>
        ))}
      </select>
    </div>
  );
}
