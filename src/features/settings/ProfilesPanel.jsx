// Profile switcher, new profile, and delete actions (spec 9; M1-13).
// Every destructive action goes through a confirmation that says exactly what it removes.
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { DELETE_ALL_DESCRIPTION } from '../../content/notices.js';
import { LIMITS } from '../../domain/limits.js';
import { StorageUsage } from './StorageUsage.jsx';

/** Rename the open profile. Remounted (by key) whenever the stored name changes, so it never shows a stale name. */
function RenameForm({ title, onRename }) {
  const fieldId = useId();
  const [value, setValue] = useState(title);
  const submit = (event) => {
    event.preventDefault();
    if (value.trim() !== '') onRename(value);
  };
  return (
    <form className="panel-block add-form" onSubmit={submit}>
      <label htmlFor={fieldId}>Name of this profile</label>
      <input id={fieldId} type="text" value={value} maxLength={LIMITS.titleLength} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" disabled={value.trim() === '' || value.trim() === title}>Rename</button>
    </form>
  );
}

/**
 * @param {{
 *   profiles: Array<{ id: string, title: string, valid: boolean }>,
 *   currentId: string|null,
 *   onSwitch: (id: string) => Promise<unknown>,
 *   onCreate: (title: string) => Promise<boolean>,
 *   onDelete: (id: string) => Promise<unknown>,
 *   onDeleteAll: () => Promise<unknown>,
 *   profile?: object|null,                       the open profile; with it the panel offers rename, copy and storage use
 *   onRename?: (title: string) => { ok: boolean },
 *   onDuplicate?: () => Promise<boolean>,
 *   estimate?: () => Promise<{ usage: number, quota: number }|null>,
 *   announce: (text: string) => void,
 * }} props
 */
export function ProfilesPanel({ profiles, currentId, onSwitch, onCreate, onDelete, onDeleteAll, announce, profile = null, onRename, onDuplicate, estimate }) {
  const id = useId();
  const [choice, setChoice] = useState('');
  const [title, setTitle] = useState('');
  const [confirm, setConfirm] = useState(null); // 'profile' | 'all'

  const selectedId = choice !== '' && profiles.some((p) => p.id === choice) ? choice : currentId ?? '';
  const current = profiles.find((p) => p.id === currentId);
  const currentName = current?.title ?? 'this profile';

  const labelFor = (p) => `${p.title}${p.valid ? '' : ' (cannot be read)'}${p.id === currentId ? ' (open)' : ''}`;

  const doSwitch = async () => {
    if (selectedId === '' || selectedId === currentId) return;
    if (await onSwitch(selectedId)) announce('Profile opened');
    setChoice('');
  };

  const doCreate = async (event) => {
    event.preventDefault();
    if (await onCreate(title)) {
      setTitle('');
      announce('New profile created');
    }
  };

  return (
    <section className="panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Profiles</h2>

      <div className="panel-block">
        <div className="add-form">
          <label htmlFor={`${id}-select`}>Open a profile</label>
          <select id={`${id}-select`} value={selectedId} onChange={(e) => setChoice(e.target.value)}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{labelFor(p)}</option>)}
          </select>
          <button type="button" onClick={doSwitch} disabled={selectedId === '' || selectedId === currentId}>Open</button>
        </div>
      </div>

      <form className="panel-block add-form" onSubmit={doCreate}>
        <label htmlFor={`${id}-new`}>New profile name</label>
        <input id={`${id}-new`} type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" disabled={title.trim() === ''}>Create profile</button>
      </form>

      {profile && onRename && (
        <RenameForm
          key={`${profile.id}:${profile.title}`}
          title={profile.title}
          onRename={(title) => { if (onRename(title).ok) announce('Profile renamed'); }}
        />
      )}

      {profile && onDuplicate && (
        <div className="panel-block panel-actions">
          <button
            type="button"
            onClick={async () => { if (await onDuplicate()) announce('Copy created and opened'); }}
          >
            Make a copy of this profile
          </button>
          <p className="hint">The copy is a separate profile with the same answers and notes. Changing one never changes the other.</p>
        </div>
      )}

      <StorageUsage profile={profile} estimate={estimate} />

      <div className="panel-block panel-actions">
        <button type="button" className="danger-text" onClick={() => setConfirm('profile')} disabled={!currentId}>
          Delete this profile
        </button>
        <button type="button" className="danger-text" onClick={() => setConfirm('all')}>
          Delete all local data
        </button>
      </div>

      {confirm === 'profile' && (
        <ConfirmDialog
          title={`Delete “${currentName}”?`}
          description="This permanently removes this profile, with its answers and notes, from this browser. Other profiles are not changed. Backup files you have downloaded are not touched. This cannot be undone."
          confirmLabel="Delete profile"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => { setConfirm(null); await onDelete(currentId); announce('Profile deleted'); }}
        />
      )}
      {confirm === 'all' && (
        <ConfirmDialog
          title="Delete all local data?"
          description={DELETE_ALL_DESCRIPTION}
          confirmLabel="Delete everything"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => { setConfirm(null); await onDeleteAll(); announce('All local data deleted'); }}
        />
      )}
    </section>
  );
}
