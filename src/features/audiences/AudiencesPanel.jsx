// Audiences screen (M4-03): add and edit audiences, see every override one audience has and why it
// shows what it shows, and settle conflicts. Closed by default, like the other panels.
// Only turns choices into domain commands through `run` (I-05). Nothing here edits an answer (I-04).
import { useId, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { LIMITS } from '../../domain/limits.js';
import { newId } from '../../domain/ids.js';
import {
  addAudience, deleteAudience, overridesForAudience, removeOverride, setOverride, setOverrideEnabled, updateAudience,
} from '../../domain/audience-commands.js';
import { explainResolution, listConflicts, resolveItem } from '../../domain/audience-resolution.js';
import { getState } from '../../domain/selectors.js';
import { compareAudience } from '../../domain/audience-compare.js';
import { AUDIENCE_KIND_CHOICES, kindLabel } from '../../content/audience-kinds.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Name, kind and description. Used to add an audience and to edit one. */
function AudienceForm({ initial, submitLabel, onSubmit, onCancel }) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'friends');
  const [description, setDescription] = useState(initial?.description ?? '');
  const submit = (event) => {
    event.preventDefault();
    if (onSubmit({ name, type, description })) {
      if (!initial) { setName(''); setDescription(''); }
    }
  };
  return (
    <form className="panel-block" onSubmit={submit}>
      <label htmlFor={`${id}-name`}>Name of the audience</label>
      <input id={`${id}-name`} type="text" value={name} maxLength={LIMITS.categoryNameLength} onChange={(e) => setName(e.target.value)} />
      <label htmlFor={`${id}-type`}>Kind of audience</label>
      <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value)}>
        {AUDIENCE_KIND_CHOICES.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      <label htmlFor={`${id}-description`}>Description (optional)</label>
      <input id={`${id}-description`} type="text" value={description} maxLength={LIMITS.descriptionLength} onChange={(e) => setDescription(e.target.value)} />
      <div className="panel-actions">
        <button type="submit" disabled={name.trim() === ''}>{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function Conflicts({ profile, conflicts, run, announce }) {
  const stateLabel = (stateId) => getState(profile, stateId)?.label ?? 'an unknown state';
  const itemLabel = (itemId) => profile.items.find((i) => i.id === itemId)?.label ?? 'an item';
  const audienceName = (audienceId) => profile.audiences.find((a) => a.id === audienceId)?.name ?? 'an audience';
  const keep = (conflict, override) => {
    const result = run(setOverride, {
      id: newId('override'), itemId: conflict.itemId, audienceId: conflict.audienceId, stateId: override.stateId, explanation: override.explanation,
    });
    if (result.ok) announce(`Kept ${stateLabel(override.stateId)} for ${audienceName(conflict.audienceId)} on ${itemLabel(conflict.itemId)}. The other overrides were removed.`);
  };
  return (
    <section className="panel-block" aria-labelledby="conflicts-heading" data-testid="conflicts">
      <h3 id="conflicts-heading">Overrides that disagree ({conflicts.length})</h3>
      <p className="hint">
        Nothing is chosen for you. While these disagree, the audience sees Unanswered for the item, and no view can be built that includes it.
        Keep one, and the others are removed.
      </p>
      <ul className="module-list">
        {conflicts.map((c) => (
          <li key={`${c.audienceId}-${c.itemId}`} className="module">
            <p><strong>{audienceName(c.audienceId)}</strong>: {itemLabel(c.itemId)}</p>
            <ul>
              {c.overrideIds.map((overrideId) => {
                const override = profile.overrides.find((o) => o.id === overrideId);
                return (
                  <li key={overrideId}>
                    {stateLabel(override.stateId)}{override.explanation ? `. Reason: ${override.explanation}` : ''}{' '}
                    <button type="button" onClick={() => keep(c, override)}>
                      Keep {stateLabel(override.stateId)}
                      {' '}<span className="visually-hidden">for {audienceName(c.audienceId)} on {itemLabel(c.itemId)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverrideList({ profile, audience, run, announce }) {
  const overrides = overridesForAudience(profile, audience.id);
  if (overrides.length === 0) return <p className="hint">No overrides. {audience.name} sees your own answers.</p>;
  return (
    <ul className="module-list">
      {overrides.map((o) => {
        const item = profile.items.find((i) => i.id === o.itemId);
        const resolution = resolveItem(profile, o.itemId, audience.id);
        return (
          <li key={o.id} className="module">
            <p><strong>{item?.label ?? 'An item'}</strong></p>
            <p className="hint">
              {explainResolution(profile, resolution)}
              {resolution.moreOpenThanDefault && ' This shows more than your own answer does.'}
              {!o.enabled && ' This override is off, so it is not used.'}
            </p>
            <div className="panel-actions">
              <label className="checkbox-row">
                <input type="checkbox" checked={o.enabled} onChange={(e) => run(setOverrideEnabled, { id: o.id, enabled: e.target.checked })} />
                <span>On{' '}<span className="visually-hidden">for {item?.label} and {audience.name}</span></span>
              </label>
              <button
                type="button"
                className="quiet danger-text"
                onClick={() => { if (run(removeOverride, { id: o.id }).ok) announce(`Removed the override for ${item?.label}. ${audience.name} sees your own answer again.`); }}
              >
                Remove{' '}<span className="visually-hidden">the override for {item?.label} and {audience.name}</span>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Print one comparison on its own: mark it, print, and always unmark afterwards. */
function printOnly(node) {
  const root = document.documentElement;
  const done = () => { root.removeAttribute('data-print'); node?.removeAttribute('data-print-target'); window.removeEventListener('afterprint', done); };
  node?.setAttribute('data-print-target', 'true');
  root.setAttribute('data-print', 'compare');
  window.addEventListener('afterprint', done);
  window.print();
}

function Compare({ profile, audience }) {
  const ref = useRef(null);
  const result = compareAudience(profile, audience.id);
  const label = (id) => getState(profile, id)?.label ?? 'an unknown state';
  if (!result.ok) return <p role="alert">{result.error}</p>;
  const { rows, counts } = result;
  return (
    <section ref={ref} className="panel-block compare" aria-label={`Compare ${audience.name} with your own answers`} data-testid="compare">
      <h4>{audience.name} compared with your own answers</h4>
      {rows.length === 0 ? (
        <p>{audience.name} sees exactly your own answers.</p>
      ) : (
        <>
          <p data-testid="compare-counts">
            {plural(counts.different, 'item differs', 'items differ')}
            {counts.moreOpen > 0 && `, ${plural(counts.moreOpen, 'shows', 'show')} more than your own answer`}
            {counts.conflicts > 0 && `, ${plural(counts.conflicts, 'is', 'are')} in conflict`}.
          </p>
          <table>
            <thead>
              <tr><th scope="col">Item</th><th scope="col">Your own answer</th><th scope="col">{audience.name} sees</th><th scope="col">Note</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId}>
                  <th scope="row">{r.label}{r.sensitivity === 'restricted' || r.sensitivity === 'sensitive' ? ` (${r.sensitivity})` : ''}</th>
                  <td>{label(r.ownStateId)}</td>
                  <td>{label(r.audienceStateId)}</td>
                  <td>
                    {r.source === 'conflict' ? 'Overrides disagree. Keep one first.' : r.moreOpen ? 'Shows more than your own answer.' : 'Shows less or the same level.'}
                    {r.reason ? ` Your reason: ${r.reason}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="panel-actions print-hide"><button type="button" onClick={() => printOnly(ref.current)}>Print this comparison</button></p>
    </section>
  );
}

function AudienceCard({ profile, audience, run, announce, onAskDelete }) {
  const [editing, setEditing] = useState(false);
  const [showing, setShowing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const bodyId = useId();
  const count = profile.overrides.filter((o) => o.audienceId === audience.id).length;
  const save = (values) => {
    const result = run(updateAudience, { id: audience.id, ...values });
    if (result.ok) { setEditing(false); announce(`Saved ${values.name.trim()}`); }
    return result.ok;
  };
  return (
    <li className="module" aria-label={audience.name}>
      <h3>{audience.name}</h3>
      <p className="hint">{kindLabel(audience.type)}{audience.description ? `. ${audience.description}` : ''}</p>
      <p className="hint">{plural(count, 'override', 'overrides')}.</p>
      {editing ? (
        <AudienceForm initial={audience} submitLabel="Save audience" onSubmit={save} onCancel={() => setEditing(false)} />
      ) : (
        <div className="panel-actions">
          <button type="button" onClick={() => setEditing(true)}>Edit{' '}<span className="visually-hidden">{audience.name}</span></button>
          <button type="button" aria-expanded={showing} aria-controls={bodyId} onClick={() => setShowing((v) => !v)}>
            {showing ? 'Hide overrides' : 'Show overrides'}{' '}<span className="visually-hidden">for {audience.name}</span>
          </button>
          <button type="button" aria-expanded={comparing} onClick={() => setComparing((v) => !v)}>
            {comparing ? 'Hide comparison' : 'Compare with my answers'}{' '}<span className="visually-hidden">for {audience.name}</span>
          </button>
          <button type="button" className="danger-text" onClick={() => onAskDelete(audience)}>Delete{' '}<span className="visually-hidden">{audience.name}</span></button>
        </div>
      )}
      {comparing && <Compare profile={profile} audience={audience} />}
      {showing && <div id={bodyId}><OverrideList profile={profile} audience={audience} run={run} announce={announce} /></div>}
    </li>
  );
}

/**
 * @param {{
 *   profile: import('../../domain/schema.js').Profile,
 *   run: (command: Function, args: object) => { ok: boolean },
 *   announce: (text: string) => void,
 * }} props
 */
export function AudiencesPanel({ profile, run, announce }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [doomed, setDoomed] = useState(null); // the audience whose delete is being confirmed
  const conflicts = listConflicts(profile);
  const doomedOverrides = doomed ? profile.overrides.filter((o) => o.audienceId === doomed.id).length : 0;

  const add = ({ name, type, description }) => {
    const result = run(addAudience, { id: newId('audience'), name, type, description });
    if (result.ok) announce(`Added the audience ${name.trim()}`);
    return result.ok;
  };
  const confirmDelete = () => {
    const target = doomed;
    setDoomed(null);
    const result = run(deleteAudience, { id: target.id });
    if (result.ok) announce(`Deleted ${target.name}. ${plural(result.removedOverrides, 'override', 'overrides')} removed. Your answers are not changed.`);
  };

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Audiences</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close audiences' : 'Open audiences'}
          {conflicts.length > 0 && <span className="visually-hidden">. {plural(conflicts.length, 'conflict needs', 'conflicts need')} attention</span>}
        </button>
      </div>
      {conflicts.length > 0 && !open && <p className="hint" role="status">{plural(conflicts.length, 'override conflict needs', 'override conflicts need')} your attention.</p>}

      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          <p className="hint">
            An audience is a group of people you might show a chart to. Your own answer is what everyone sees by default. For an audience you can
            set an override on any item, from the Audiences button on that item. An override never changes your own answer.
          </p>

          {conflicts.length > 0 && <Conflicts profile={profile} conflicts={conflicts} run={run} announce={announce} />}

          {profile.audiences.length === 0 ? (
            <p className="hint">No audiences yet.</p>
          ) : (
            <ul className="module-list">
              {profile.audiences.map((a) => (
                <AudienceCard key={a.id} profile={profile} audience={a} run={run} announce={announce} onAskDelete={setDoomed} />
              ))}
            </ul>
          )}

          <h3>Add an audience</h3>
          <AudienceForm submitLabel="Add audience" onSubmit={add} />
        </div>
      )}

      {doomed && (
        <ConfirmDialog
          title={`Delete ${doomed.name}?`}
          description={`This removes the audience and its ${plural(doomedOverrides, 'override', 'overrides')}. Your own answers are not changed. You can undo this until you close or reload the page.`}
          confirmLabel="Delete audience"
          onConfirm={confirmDelete}
          onCancel={() => setDoomed(null)}
        />
      )}
    </section>
  );
}
