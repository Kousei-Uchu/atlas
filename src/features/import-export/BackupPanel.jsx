// Full-backup export and import-as-new (spec 10; M1-13, M1-AC-08, M1-AC-09, I-12).
//
// Export is labelled as a full backup that contains everything, so it can never be
// mistaken for a shared view. Import always runs the same validation gate as every
// other untrusted source, shows a preview, and only creates a NEW profile after the
// person confirms. A failed import changes nothing.
import { useId, useRef, useState } from 'react';
import {
  backupFilename, checkBackupFileSize, parseBackupText, previewBackup, serialiseBackup,
} from '../../storage/backup.js';
import { failure } from '../../domain/validation.js';
import { BACKUP_NOTICE, IMPORT_NOTICE } from '../../content/notices.js';

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

  const exportBackup = () => {
    if (!profile) return;
    const stamp = now();
    saveFile(backupFilename(profile, stamp), serialiseBackup(profile, stamp));
    announce('Backup downloaded');
  };

  const reset = () => {
    setPending(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const showFailure = (result) => {
    setPending(null);
    setError({ message: result.error.message, problems: result.error.problems });
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    setPending(null);
    setError(null);
    if (!file) return;

    // Size is checked before the file is read (spec 10.2 step 1).
    const size = checkBackupFileSize(file.size);
    if (!size.ok) return showFailure(size);

    let text;
    try {
      text = await file.text();
    } catch {
      return showFailure(failure('not-json'));
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
        <h3>Import a backup</h3>
        <p className="hint">{IMPORT_NOTICE}</p>
        <label htmlFor={inputId} className="file-label">Choose a backup file (.json)</label>
        <input id={inputId} ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} />

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
