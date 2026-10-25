// Accessible confirmation dialog for destructive actions.
//
// - role="alertdialog" with a name and description
// - focus moves to Cancel on open (the safe choice) and returns to the opener on close
// - Tab stays inside the dialog, Escape cancels
//
// Built by hand rather than with <dialog>.showModal() so behaviour is identical in
// every supported browser and in the test environment.
import { useEffect, useId, useRef } from 'react';

/**
 * @param {{
 *   title: string,
 *   description: string,
 *   confirmLabel: string,
 *   cancelLabel?: string,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 * }} props
 */
export function ConfirmDialog({ title, description, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel }) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    // Two buttons only: wrap focus between them.
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      {/* The keydown handler lives on the dialog so Escape and Tab apply while it is open. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="dialog-title">{title}</h2>
        <p id={descriptionId} className="dialog-description">{description}</p>
        <div className="dialog-actions">
          <button type="button" ref={cancelRef} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" ref={confirmRef} className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
