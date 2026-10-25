// A "Rename" button that swaps in a text field. Enter saves, Escape cancels.
// Focus returns to the Rename button afterwards so keyboard users keep their place.
import { useEffect, useRef, useState } from 'react';

/**
 * @param {{
 *   label: string,        // what is being renamed, for accessible names, e.g. "category Contact"
 *   value: string,
 *   maxLength: number,
 *   onSave: (next: string) => void,
 * }} props
 */
export function InlineRename({ label, value, maxLength, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);
  const buttonRef = useRef(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (wasEditing.current) buttonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };

  const save = () => {
    const next = draft.trim();
    if (next !== '' && next !== value) onSave(next);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button type="button" ref={buttonRef} className="quiet" onClick={start}>
        Rename{' '}<span className="visually-hidden">{label}</span>
      </button>
    );
  }

  return (
    <span className="inline-rename">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={maxLength}
        aria-label={`New name for ${label}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); save(); }
          if (event.key === 'Escape') { event.preventDefault(); setEditing(false); }
        }}
      />
      <button type="button" onClick={save}>Save{' '}<span className="visually-hidden">new name for {label}</span></button>
      <button type="button" className="quiet" onClick={() => setEditing(false)}>Cancel</button>
    </span>
  );
}
