// The state button for one item (spec 8; D-003, D-021; M1-AC-04, M1-AC-05).
//
//   primary action    click, tap, Enter, Space
//   secondary action  right click, Shift+Enter, Shift+Space
//
// Which direction each action moves is decided by the profile's setting, not here;
// this component only reports 'primary' or 'secondary'.
//
// The context menu is suppressed on this button only. Everyone can still reach every
// state without a right click through the picker beside it.
import { useRef } from 'react';
import { StateBadge } from '../../components/StateBadge.jsx';

/**
 * @param {{
 *   itemLabel: string,
 *   state: import('../../domain/schema.js').State,
 *   onAction: (kind: 'primary'|'secondary') => void,
 * }} props
 */
export function StateCell({ itemLabel, state, onAction }) {
  // A Shift+Space press must not also fire the browser's own click on key release.
  const swallowSpaceRelease = useRef(false);

  const onKeyDown = (event) => {
    if (!event.shiftKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.key === ' ') swallowSpaceRelease.current = true;
      onAction('secondary');
    }
  };

  const onKeyUp = (event) => {
    if (event.key === ' ' && swallowSpaceRelease.current) {
      event.preventDefault();
      swallowSpaceRelease.current = false;
    }
  };

  const onContextMenu = (event) => {
    event.preventDefault();
    onAction('secondary');
  };

  return (
    <button
      type="button"
      className="state-cell"
      // The accessible name carries the item label and the state text (M1-AC-05).
      aria-label={`${itemLabel}: ${state.label}`}
      onClick={() => onAction('primary')}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={onContextMenu}
    >
      <StateBadge state={state} />
    </button>
  );
}
