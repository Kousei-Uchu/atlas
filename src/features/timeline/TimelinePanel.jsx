// Timeline and snapshots (M7-03, D-063). A snapshot keeps the answers to the state questions as they are now,
// so a person can see later what changed. It describes changes in plain words and never scores them.
// All edits go through `run` (I-05). Making a new profile never changes the open one (I-12).
import { useId, useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { newId } from '../../domain/ids.js';
import { deleteAllSnapshots, deleteSnapshot, takeSnapshot } from '../../domain/snapshot-commands.js';
import { diffEntries, timeline } from '../../domain/timeline.js';
import { SNAPSHOT_NOTICE } from '../../content/notices.js';

const MAX_ROWS = 200;
const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const defaultName = () => `Snapshot ${new Date().toISOString().slice(0, 10)}`;
const answers = (n) => (n === 1 ? '1 answer' : `${n} answers`);

function ChangeList({ title, rows, render }) {
  if (rows.length === 0) return null;
  return (
    <>
      <h4>{title} ({rows.length})</h4>
      <ul className="tl-changes">
        {rows.slice(0, MAX_ROWS).map((row, i) => <li key={i}>{render(row)}</li>)}
      </ul>
      {rows.length > MAX_ROWS && <p className="hint">And {rows.length - MAX_ROWS} more.</p>}
    </>
  );
}

function Comparison({ profile, points, fromKey, toKey }) {
  const from = points.find((p) => p.key === fromKey);
  const to = points.find((p) => p.key === toKey);
  const itemsNow = useMemo(() => new Set(profile.items.map((i) => i.id)), [profile.items]);
  if (!from || !to) return null;
  const diff = diffEntries(from.entries, to.entries);
  const name = (p) => (p.kind === 'now' ? 'now' : p.snapshot.label);
  const total = diff.newlyAnswered.length + diff.cleared.length + diff.changed.length;
  const gone = (entry) => (to.kind === 'now' && !itemsNow.has(entry.itemId) ? ' (this item is no longer in the chart)' : '');
  return (
    <div className="tl-compare" aria-live="polite">
      <p>
        From {name(from)} to {name(to)}: {total === 0 ? 'no answers changed' : `${answers(total)} changed`}
        {diff.same > 0 ? `, ${diff.same} stayed the same` : ''}.
      </p>
      <ChangeList title="Changed" rows={diff.changed} render={({ before, after }) => <>{after.label} ({after.categoryName}): {before.stateLabel}, then {after.stateLabel}</>} />
      <ChangeList title="Answered since" rows={diff.newlyAnswered} render={(e) => <>{e.label} ({e.categoryName}): {e.stateLabel}</>} />
      <ChangeList title="Answer cleared since" rows={diff.cleared} render={(e) => <>{e.label} ({e.categoryName}): was {e.stateLabel}{gone(e)}</>} />
    </div>
  );
}

/**
 * @param {{ profile: object, run: Function, announce: (t: string) => void, onMakeProfile: (id: string) => Promise<{ ok: boolean, skipped?: number }> }} props
 */
export function TimelinePanel({ profile, run, announce, onMakeProfile }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState(null);
  const [doomed, setDoomed] = useState(null); // snapshot | 'all'
  const [making, setMaking] = useState(null);
  const [fromKey, setFromKey] = useState(null);
  const [toKey, setToKey] = useState('now');

  const points = useMemo(() => timeline(profile), [profile]);
  const snapshots = points.filter((p) => p.kind === 'snapshot');
  const from = fromKey && points.some((p) => p.key === fromKey) ? fromKey : snapshots.at(-1)?.key ?? null;
  const to = points.some((p) => p.key === toKey) ? toKey : 'now';

  const save = (event) => {
    event.preventDefault();
    const result = run(takeSnapshot, { id: newId('snapshot'), label: name });
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setName(defaultName());
    announce(`Snapshot saved: ${name.trim()}`);
  };

  const confirmDelete = () => {
    const target = doomed;
    setDoomed(null);
    const result = target === 'all' ? run(deleteAllSnapshots, {}) : run(deleteSnapshot, { id: target.id });
    if (result.ok) announce(target === 'all' ? 'All snapshots deleted' : `Snapshot deleted: ${target.label}`);
  };

  const confirmMake = async () => {
    const target = making;
    setMaking(null);
    const result = await onMakeProfile(target.id);
    if (result.ok) announce(result.skipped > 0 ? `New profile made. ${result.skipped} answers could not be kept because their item or state is gone.` : 'New profile made from the snapshot.');
  };

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Timeline and snapshots</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close timeline' : 'Open timeline'}
        </button>
      </div>
      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          <p className="hint">{SNAPSHOT_NOTICE}</p>

          <form className="add-form" onSubmit={save}>
            <label className="field">
              <span>Name for this snapshot</span>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
            </label>
            <button type="submit">Save snapshot</button>
          </form>
          {error && <p role="alert" className="error">{error}</p>}

          {snapshots.length === 0 ? (
            <p className="hint">No snapshots yet. Save one to start a timeline.</p>
          ) : (
            <>
              <ol className="tl-list" aria-label="Timeline, oldest first">
                {points.map((point) => (
                  <li key={point.key} className="tl-point">
                    {point.kind === 'now' ? (
                      <p><strong>Now</strong>: {answers(point.entries.length)}{point.changesSincePrevious !== null && `, ${point.changesSincePrevious} changed since the last snapshot`}</p>
                    ) : (
                      <>
                        <p>
                          <strong>{point.snapshot.label}</strong>, {when(point.snapshot.takenAt)}: {answers(point.entries.length)}
                          {point.changesSincePrevious !== null && `, ${point.changesSincePrevious} changed since the one before`}
                        </p>
                        <div className="tl-actions">
                          <button type="button" onClick={() => setMaking(point.snapshot)}>Make a new profile from {point.snapshot.label}</button>
                          <button type="button" onClick={() => setDoomed(point.snapshot)}>Delete {point.snapshot.label}</button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ol>

              <h3>Compare</h3>
              <div className="tl-selects">
                <label className="field">
                  <span>From</span>
                  <select value={from ?? ''} onChange={(event) => setFromKey(event.target.value)}>
                    {snapshots.map((p) => <option key={p.key} value={p.key}>{p.snapshot.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>To</span>
                  <select value={to} onChange={(event) => setToKey(event.target.value)}>
                    {points.filter((p) => p.key !== from).map((p) => <option key={p.key} value={p.key}>{p.kind === 'now' ? 'Now' : p.snapshot.label}</option>)}
                  </select>
                </label>
              </div>
              <Comparison profile={profile} points={points} fromKey={from} toKey={to === from ? 'now' : to} />
              <p><button type="button" onClick={() => setDoomed('all')}>Delete all snapshots</button></p>
            </>
          )}
        </div>
      )}
      {doomed && (
        <ConfirmDialog
          title={doomed === 'all' ? 'Delete all snapshots?' : `Delete the snapshot ${doomed.label}?`}
          description={doomed === 'all'
            ? 'This removes every snapshot from this profile. Your chart is not changed. Backups and files you already made keep their own copies. You can undo this until you close or reload the page.'
            : 'This removes the snapshot only. Your chart is not changed. Backups and files you already made keep their own copies. You can undo this until you close or reload the page.'}
          confirmLabel={doomed === 'all' ? 'Delete all snapshots' : 'Delete snapshot'}
          onConfirm={confirmDelete}
          onCancel={() => setDoomed(null)}
        />
      )}
      {making && (
        <ConfirmDialog
          title={`Make a new profile from ${making.label}?`}
          description="This makes a new profile with the answers from that snapshot and opens it. The profile you are in now is not changed. Notes and your own words are not included, because snapshots do not keep them."
          confirmLabel="Make new profile"
          onConfirm={confirmMake}
          onCancel={() => setMaking(null)}
        />
      )}
    </section>
  );
}
