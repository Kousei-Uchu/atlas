// What each audience sees for one item (M4-03). Shown inside an item row when the profile has audiences.
// For each audience: the choice (same as my answer, or a state), the person's reason, and a plain
// sentence saying what the audience sees and why. Every change goes through a domain command (I-05),
// and none of them touches the item's own answer (I-04).
import { useId } from 'react';
import { LIMITS } from '../../domain/limits.js';
import { newId } from '../../domain/ids.js';
import { setOverride, setOverrideEnabled, removeOverride } from '../../domain/audience-commands.js';
import { explainResolution, resolveItem } from '../../domain/audience-resolution.js';
import { getState } from '../../domain/selectors.js';
import { kindLabel } from '../../content/audience-kinds.js';

const SAME = '';
const CONFLICT = '__conflict';

function AudienceLine({ profile, item, audience, run, announce }) {
  const id = useId();
  const overrides = profile.overrides.filter((o) => o.itemId === item.id && o.audienceId === audience.id);
  const resolution = resolveItem(profile, item.id, audience.id);
  const conflict = resolution.source === 'conflict';
  const own = overrides.length === 1 ? overrides[0] : null;
  const value = conflict ? CONFLICT : own ? own.stateId : SAME;
  // Any state the person can choose, plus Unanswered, so an audience can be shown "nothing answered".
  const choices = profile.states.filter((s) => s.isSelectable || s.isUnanswered);

  const choose = (next) => {
    if (next === CONFLICT) return;
    if (next === SAME) {
      if (overrides.length === 0) return;
      // Removing every override of the pair puts the audience back on the person's own answer.
      let last = null;
      for (const o of overrides) last = run(removeOverride, { id: o.id });
      if (last?.ok) announce(`${audience.name} now sees your own answer for ${item.label}`);
      return;
    }
    const result = run(setOverride, { id: newId('override'), itemId: item.id, audienceId: audience.id, stateId: next, explanation: own?.explanation ?? '' });
    if (result.ok) announce(`${audience.name} now sees ${getState(profile, next)?.label ?? 'that state'} for ${item.label}`);
  };

  const saveReason = (text) => {
    if (!own) return;
    run(setOverride, { id: own.id, itemId: item.id, audienceId: audience.id, stateId: own.stateId, explanation: text }, { group: `override-reason:${own.id}` });
  };

  return (
    <li className="audience-line">
      <div className="audience-line-head">
        <label htmlFor={`${id}-choice`}>
          <span className="audience-name">{audience.name}</span>{' '}
          <span className="hint">({kindLabel(audience.type)})</span>
          {' '}<span className="visually-hidden">sees, for {item.label}</span>
        </label>
        <select id={`${id}-choice`} value={value} onChange={(event) => choose(event.target.value)}>
          <option value={SAME}>Same as my answer</option>
          {conflict && <option value={CONFLICT}>Overrides disagree: choose one</option>}
          {choices.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      {own && (
        <>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={own.enabled}
              onChange={(event) => run(setOverrideEnabled, { id: own.id, enabled: event.target.checked })}
            />
            <span>This override is on for {audience.name}</span>
          </label>
          <label htmlFor={`${id}-reason`}>Reason for {audience.name} (optional)</label>
          <input
            id={`${id}-reason`}
            type="text"
            maxLength={LIMITS.descriptionLength}
            value={own.explanation}
            onChange={(event) => saveReason(event.target.value)}
          />
        </>
      )}
      <p className="hint" data-testid="audience-effect">
        {explainResolution(profile, resolution)}
        {resolution.moreOpenThanDefault && ' This shows more than your own answer does.'}
        {own && !own.enabled && ' This override is off, so it is not used.'}
      </p>
    </li>
  );
}

/**
 * @param {{
 *   profile: import('../../domain/schema.js').Profile,
 *   item: import('../../domain/schema.js').Item,
 *   run: (command: Function, args: object, options?: object) => { ok: boolean },
 *   announce: (text: string) => void,
 * }} props
 */
export function ItemAudiences({ profile, item, run, announce }) {
  return (
    <div className="item-audiences">
      <p className="hint">
        Choose what each audience sees for this item. Your own answer is not changed. Anything you do not set is shown as your own answer.
      </p>
      <ul className="audience-lines">
        {profile.audiences.map((audience) => (
          <AudienceLine key={audience.id} profile={profile} item={item} audience={audience} run={run} announce={announce} />
        ))}
      </ul>
    </div>
  );
}
