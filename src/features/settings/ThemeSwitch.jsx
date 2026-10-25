// The Appearance menu (M2-04). A native <select>, so it works with every input method and
// the native touch picker on phones. It only changes how the app looks on this device.
import { useId } from 'react';

const OPTIONS = [
  ['system', 'Match my device'],
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['high-contrast', 'High contrast'],
];

const LABELS = Object.fromEntries(OPTIONS);

/**
 * @param {{
 *   choice: string,
 *   saveFailed: boolean,
 *   onChange: (next: string) => void,
 *   announce: (text: string) => void,
 * }} props
 */
export function ThemeSwitch({ choice, saveFailed, onChange, announce }) {
  const id = useId();
  return (
    <div className="theme-switch">
      <label htmlFor={`${id}-theme`}>Appearance</label>
      <select
        id={`${id}-theme`}
        value={choice}
        aria-describedby={saveFailed ? `${id}-theme-error` : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          announce(`Appearance set to ${LABELS[event.target.value]}`);
        }}
      >
        {OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
      {saveFailed && (
        <p className="field-error" id={`${id}-theme-error`}>
          This choice could not be saved, so it will reset when you reload.
        </p>
      )}
    </div>
  );
}
