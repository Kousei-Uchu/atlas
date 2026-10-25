// Asks what should happen to answers that use a state before it is removed.
// The default is to clear them, which is always safe. The "move to" choices are limited
// to states that are not more permissive (see removalReplacements).
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { removalReplacements } from '../../domain/palette-commands.js';
import { stateUsage } from '../../domain/selectors.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * @param {{
 *   profile: import('../../domain/schema.js').Profile,
 *   stateId: string,
 *   onConfirm: (replacementId: string|null) => void,
 *   onCancel: () => void,
 * }} props
 */
export function RemoveStateDialog({ profile, stateId, onConfirm, onCancel }) {
  const id = useId();
  const [choice, setChoice] = useState('');
  const state = profile.states.find((s) => s.id === stateId);
  if (!state) return null;

  const usage = stateUsage(profile, stateId);
  const used = usage.answers + usage.overrides > 0;
  const replacements = removalReplacements(profile, stateId);

  const parts = [];
  if (usage.answers > 0) parts.push(plural(usage.answers, 'answer', 'answers'));
  if (usage.overrides > 0) parts.push(plural(usage.overrides, 'audience override', 'audience overrides'));

  const description = used
    ? `${parts.join(' and ')} currently use this state. Choose what should happen to them. You can undo this until you close or reload the page.`
    : 'No answers use this state. You can undo this until you close or reload the page.';

  return (
    <ConfirmDialog
      title={`Remove “${state.label}”?`}
      description={description}
      confirmLabel="Remove state"
      onCancel={onCancel}
      onConfirm={() => onConfirm(choice === '' ? null : choice)}
    >
      {used && (
        <div className="field">
          <label htmlFor={`${id}-choice`}>What should happen to them?</label>
          <select id={`${id}-choice`} value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">Clear them (they become Unanswered; notes are kept)</option>
            {replacements.map((s) => <option key={s.id} value={s.id}>Move them to “{s.label}”</option>)}
          </select>
          <p className="hint">Answers are only offered a move to states that are no more permissive, so removing a state never turns a No or Unsure into a Yes.</p>
        </div>
      )}
    </ConfirmDialog>
  );
}
