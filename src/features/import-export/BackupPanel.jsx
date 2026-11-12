// Full-backup export and import-as-new (spec 10; M1-13, M1-AC-08, M1-AC-09, I-12).
//
// Export is labelled as a full backup that contains everything, so it can never be
// mistaken for a shared view. Import always runs the same validation gate as every
// other untrusted source, shows a preview, and only creates a NEW profile after the
// person confirms. A failed import changes nothing.
import { useId, useRef, useState } from 'react';
import {
  backupFilename, parseBackupText, previewBackup, serialiseBackup,
} from '../../storage/backup.js';
import { failure } from '../../domain/validation.js';
import { BACKUP_NOTICE, IMPORT_NOTICE, LOCKED_NOTICE } from '../../content/notices.js';
import {
  MAX_LOCKED_FILE_BYTES, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, canLock, checkPassword, lockBackup, looksLocked, unlockBackup,
} from '../../storage/locked-backup.js';

/**
 * @param {{
 *   profile: object|null,
 *   existingIds: string[],
 *   now: () => string,
 *   saveFile: (filename: string, text: string) => void,
 *   onImport: (profile: object) => Promise<unknown>,
 *   announce: (text: string) => void,
 * }} props
 */
export function BackupPanel({ profile, existingIds, now, saveFile, onImport, announce }) {
  const inputId = useId();
  const fileRef = useRef(null);
  const [error, setError] = useState(null); // { message, problems }
  const [pending, setPending] = useState(null); // { profile, preview }
  const [busy, setBusy] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [lockAgain, setLockAgain] = useState('');
  const [lockMessage, setLockMessage] = useState('');
  const [locked, setLocked] = useState(null); // { text } while a locked file waits for its password
  const [unlockPassword, setUnlockPassword] = useState('');
  const cryptoReady = canLock();

  const exportBackup = () => {
    if (!profile) return;
    const stamp = now();
    saveFile(backupFilename(profile, stamp), serialiseBackup(profile, stamp));
    announce('Backup downloaded');
  };

  const exportLocked = async () => {
    if (!profile || busy) return;
    setLockMessage('');
    const checked = checkPassword(lockPassword);
    if (!checked.ok) return setLockMessage(checked.message);
    if (lockPassword !== lockAgain) return setLockMessage('The two passwords are not the same.');
    setBusy(true);
    try {
      const stamp = now();
      const result = await lockBackup(serialiseBackup(profile, stamp), lockPassword);
      if (!result.ok) return setLockMessage(result.error.message);
      saveFile(backupFilename(profile, stamp).replace(/\.json$/, '-locked.json'), result.text);
      setLockPassword('');
      setLockAgain('');
      announce('Locked backup downloaded. Keep the password: it cannot be recovered.');
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!locked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const opened = await unlockBackup(locked.text, unlockPassword);
      if (!opened.ok) return showFailure(opened, opened.error.code === 'wrong-password');
      const parsed = parseBackupText(opened.text);
      if (!parsed.ok) return showFailure(parsed);
      setLocked(null);
      setUnlockPassword('');
      setPending({
        profile: parsed.profile,
        preview: previewBackup(parsed.profile, { exportedAt: parsed.exportedAt, existingIds }),
      });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPending(null);
    setError(null);
    setLocked(null);
    setUnlockPassword('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const showFailure = (result, keepLocked = false) => {
    setPending(null);
    if (!keepLocked) { setLocked(null); setUnlockPassword(''); }
    setError({ message: result.error.message, problems: result.error.problems });
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    setPending(null);
    setError(null);
    setLocked(null);
    setUnlockPassword('');
    if (!file) return;

    // Size is checked before the file is read (spec 10.2 step 1). A locked file is larger than the backup inside it.
    const size = file.size > MAX_LOCKED_FILE_BYTES ? failure('file-too-large') : { ok: true };
    if (!size.ok) return showFailure(size);

    let text;
    try {
      text = await file.text();
    } catch {
      return showFailure(failure('not-json'));
    }
    if (looksLocked(text)) {
      setLocked({ text });
      announce('This backup is locked. Type its password to open it.');
      return;
    }
    const parsed = parseBackupText(text);
    if (!parsed.ok) return showFailure(parsed);
    setPending({
      profile: parsed.profile,
      preview: previewBackup(parsed.profile, { exportedAt: parsed.exportedAt, existingIds }),
    });
  };

  const confirmImport = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await onImport(pending.profile);
      announce(`Imported “${pending.profile.title}” as a new profile`);
      reset();
    } catch {
      setPending(null);
      setError({ message: 'The import could not be saved, so nothing was changed. Please try again.', problems: [] });
    } finally {
      setBusy(false);
    }
  };

  const counts = pending?.preview.counts;
  return (
    <section className="panel" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`}>Backup</h2>

      <div className="panel-block">
        <h3>Download a full backup</h3>
        <p className="hint">{BACKUP_NOTICE}</p>
        <div>
          <button type="button" onClick={exportBackup} disabled={!profile}>Download full backup</button>
        </div>
      </div>

      <div className="panel-block">
        <h3>Download a locked backup</h3>
        <p className="hint">{LOCKED_NOTICE}</p>
        {!cryptoReady ? (
          <p className="hint">This page cannot do encryption here. Open the app from its https address or from localhost to lock a backup.</p>
        ) : (
          <>
            <label className="field">
              <span>Password (at least {MIN_PASSWORD_LENGTH} characters; a few words in a row works well)</span>
              <input type="password" autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} value={lockPassword} onChange={(event) => setLockPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>Type the password again</span>
              <input type="password" autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} value={lockAgain} onChange={(event) => setLockAgain(event.target.value)} />
            </label>
            {lockMessage && <p role="alert" className="hint">{lockMessage}</p>}
            <div>
              <button type="button" onClick={exportLocked} disabled={!profile || busy}>Download locked backup</button>
            </div>
          </>
        )}
      </div>

      <div className="panel-block">
        <h3>Import a backup</h3>
        <p className="hint">{IMPORT_NOTICE}</p>
        <label htmlFor={inputId} className="file-label">Choose a backup file (.json)</label>
        <input id={inputId} ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} />

        {locked && (
          <div className="preview" role="region" aria-label="Locked backup">
            <h4>This backup is locked</h4>
            <label className="field">
              <span>Password for this backup</span>
              <input type="password" autoComplete="current-password" maxLength={MAX_PASSWORD_LENGTH * 4} value={unlockPassword} onChange={(event) => setUnlockPassword(event.target.value)} />
            </label>
            <div className="panel-actions">
              <button type="button" onClick={unlock} disabled={busy || unlockPassword === ''}>Unlock backup</button>
              <button type="button" onClick={reset} disabled={busy}>Cancel</button>
            </div>
          </div>
        )}

        {error && (
          <div className="banner" role="alert" data-tone="error">
            <div>
              <p>{error.message}</p>
              {error.problems.length > 0 && (
                <ul className="problem-list">
                  {error.problems.map((problem) => <li key={problem}>{problem}</li>)}
                </ul>
              )}
              <p>Nothing was imported and your existing profiles are unchanged.</p>
            </div>
          </div>
        )}

        {pending && (
          <div className="preview" role="region" aria-label="Import preview">
            <h4>Ready to import: {pending.preview.title}</h4>
            {pending.preview.exportedAt && <p className="hint">Exported {pending.preview.exportedAt}</p>}
            <ul className="preview-counts">
              <li>{counts.categories} categories</li>
              <li>{counts.items} items</li>
              <li>{counts.answers} answers</li>
              <li>{counts.notes} notes</li>
              <li>{counts.states} states</li>
            </ul>
            {pending.preview.warnings.length > 0 && (
              <ul className="problem-list">
                {pending.preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
            <div className="panel-actions">
              <button type="button" onClick={confirmImport} disabled={busy}>Import as new profile</button>
              <button type="button" onClick={reset} disabled={busy}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
