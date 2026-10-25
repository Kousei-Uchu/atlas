// A colour chosen with the native colour picker, plus a hex field for typing or pasting.
// Both are labelled. The value is display-only and never changes any answer (I-03).
import { useId } from 'react';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * @param {{ label: string, value: string, onChange: (next: string) => void, describedBy?: string }} props
 *   `describedBy` is the id of a note (such as the contrast note) both inputs should point at.
 */
export function ColourField({ label, value, onChange, describedBy }) {
  const id = useId();
  return (
    <div className="colour-field">
      <label htmlFor={`${id}-pick`}>{label}</label>
      <div className="colour-inputs">
        <input
          id={`${id}-pick`}
          type="color"
          value={HEX.test(value) ? value.toLowerCase() : '#000000'}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <label htmlFor={`${id}-hex`} className="visually-hidden">{label}, as a hex code</label>
        <input
          id={`${id}-hex`}
          type="text"
          value={value}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
