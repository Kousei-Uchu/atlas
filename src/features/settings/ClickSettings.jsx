// Click behaviour (M2-09): which way a primary click moves, and what happens at the end of
// the cycle. Both are saved in the profile, so they come with a backup and can be undone.
// Native radio buttons, so they work with every input method. This component only turns a
// choice into a domain command through `run` (I-05).
import { useId, useState } from 'react';
import { setEndBehaviour, setPrimaryDirection } from '../../domain/settings-commands.js';
import { getCycle } from '../../domain/state-cycle.js';

/** Names for the two ends of the cycle, taken from the states so renamed states show up here. */
function endNames(profile) {
  const cycle = getCycle([...profile.states]);
  if (cycle.length < 2) return { negative: 'the first state', positive: 'the last state' };
  return { negative: cycle[0].label, positive: cycle[cycle.length - 1].label };
}

function Choice({ name, value, checked, onChange, label, hint }) {
  const id = useId();
  return (
    <div className="choice">
      <input id={id} type="radio" name={name} value={value} checked={checked} aria-describedby={`${id}-hint`} onChange={() => onChange(value)} />
      <div className="choice-text">
        <label htmlFor={id}>{label}</label>
        <span className="hint" id={`${id}-hint`}>{hint}</span>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   profile: import('../../domain/schema.js').Profile,
 *   run: (command: Function, args: object) => { ok: boolean },
 *   announce: (text: string) => void,
 * }} props
 */
export function ClickSettings({ profile, run, announce }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const ends = endNames(profile);
  const { primaryDirection } = profile.settings.interaction;
  const { endBehaviour } = profile.settings.cycle;
  const other = primaryDirection === 'negative' ? 'positive' : 'negative';

  const chooseDirection = (value) => {
    const result = run(setPrimaryDirection, { primaryDirection: value });
    if (result.ok) announce(`A primary click now moves toward ${ends[value]}`);
  };
  const chooseEnd = (value) => {
    const result = run(setEndBehaviour, { endBehaviour: value });
    if (result.ok) announce(value === 'loop' ? 'Clicks now go around at the end of the cycle' : 'Clicks now stop at the end of the cycle');
  };

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Click behaviour</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide click behaviour' : 'Edit click behaviour'}
        </button>
      </div>

      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          <p className="hint">
            These settings belong to this profile. They change what the next click does and never change an answer
            that is already saved.
          </p>

          <fieldset className="choice-group">
            <legend>Which way a primary click moves</legend>
            <Choice
              name={`${panelId}-direction`}
              value="negative"
              checked={primaryDirection === 'negative'}
              onChange={chooseDirection}
              label={`Toward ${ends.negative}`}
              hint="Clicking, tapping, Enter and Space step this way."
            />
            <Choice
              name={`${panelId}-direction`}
              value="positive"
              checked={primaryDirection === 'positive'}
              onChange={chooseDirection}
              label={`Toward ${ends.positive}`}
              hint="Clicking, tapping, Enter and Space step this way."
            />
            <p className="hint">
              Right click, Shift with Enter, and Shift with Space always step the other way, toward {ends[other]}.
              The “Set to” menu beside each item reaches any state directly.
            </p>
          </fieldset>

          <fieldset className="choice-group">
            <legend>At the end of the click cycle</legend>
            <Choice
              name={`${panelId}-end`}
              value="clamp"
              checked={endBehaviour === 'clamp'}
              onChange={chooseEnd}
              label="Stop at the end"
              hint={`A click past ${ends.positive} or ${ends.negative} changes nothing and says it is already at the end.`}
            />
            <Choice
              name={`${panelId}-end`}
              value="loop"
              checked={endBehaviour === 'loop'}
              onChange={chooseEnd}
              label="Go around to the other end"
              hint={`A click past ${ends.positive} goes to ${ends.negative}, and the other way round. Undo is always available.`}
            />
          </fieldset>
        </div>
      )}
    </section>
  );
}
