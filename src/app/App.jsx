// App shell (M1-10): header with undo/redo and save status, the fixed notices,
// the chart, and a polite live region. No routing and no hash links, because the
// URL fragment is reserved for share links later (D-017).
import { useEffect, useState } from 'react';
import { openAtlasDb } from '../storage/database.js';
import { useProfileSession } from '../features/editor/use-profile-session.js';
import { MatrixView } from '../features/editor/MatrixView.jsx';
import { PalettePanel } from '../features/palette/PalettePanel.jsx';
import { Notice } from '../components/Notice.jsx';
import { BackupPanel } from '../features/import-export/BackupPanel.jsx';
import { ProfilesPanel } from '../features/settings/ProfilesPanel.jsx';
import { ThemeSwitch } from '../features/settings/ThemeSwitch.jsx';
import { useTheme } from '../features/settings/use-theme.js';
import { renameProfile } from '../domain/profile-commands.js';
import { downloadTextFile } from '../features/import-export/download.js';
import { serialiseRawRecord } from '../storage/backup.js';
import {
  CONFLICT_HELP, CONSENT_NOTICE, LOCAL_STORAGE_NOTICE, NO_UPLOAD_NOTICE, SAVE_STATUS_TEXT,
} from '../content/notices.js';

/** True when a key press is aimed at something that has its own text undo. */
function isTextTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** The editor for an open database. Exported separately so tests can pass their own db. */
export function Atlas({ db, debounceMs, now = () => new Date().toISOString(), makeId, saveFile = downloadTextFile, estimate }) {
  const session = useProfileSession({ db, debounceMs, now, makeId });
  const { phase, profile, undo, redo } = session;
  // Called before any early return, so the saved theme applies even when the chart cannot load.
  const theme = useTheme(db);

  // Standard undo/redo shortcuts, except inside text fields where the browser handles them.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || isTextTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const managementPanels = (currentId, ready = false) => (
    <>
      <ProfilesPanel
        profiles={session.profiles}
        currentId={currentId}
        onSwitch={session.switchProfile}
        onCreate={session.createNewProfile}
        onDelete={session.removeProfile}
        onDeleteAll={session.removeEverything}
        announce={session.announce}
        profile={ready ? session.profile : null}
        onRename={ready ? (title) => session.run(renameProfile, { title }) : undefined}
        onDuplicate={ready ? session.duplicateCurrentProfile : undefined}
        estimate={estimate}
      />
      <BackupPanel
        profile={session.profile}
        existingIds={session.profiles.map((p) => p.id)}
        now={now}
        saveFile={saveFile}
        onImport={session.importProfile}
        announce={session.announce}
      />
    </>
  );

  if (phase === 'loading') return <main className="app-main"><p role="status">Loading…</p></main>;
  if (phase === 'failed') {
    return (
      <main className="app-main">
        <h1>Personal Boundaries &amp; Identity Atlas</h1>
        <p role="alert">{session.failure}</p>
      </main>
    );
  }
  if (phase === 'invalid') {
    return (
      <main className="app-main">
        <h1>Personal Boundaries &amp; Identity Atlas</h1>
        <p role="alert">{session.invalid.error.message}</p>
        <p>The stored data has not been changed.</p>
        <p>
          <button
            type="button"
            onClick={() => saveFile(`atlas-raw-record-${now().slice(0, 10)}.json`, serialiseRawRecord(session.invalid.raw, now()))}
          >
            Download the unreadable record
          </button>
        </p>
        {managementPanels(session.invalid.id)}
        <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{session.announcement}</div>
      </main>
    );
  }

  const status = SAVE_STATUS_TEXT[session.saveStatus];
  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Personal Boundaries &amp; Identity Atlas</h1>
          <p className="profile-name">Profile: {profile.title}</p>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Chart actions">
          <button type="button" onClick={undo} disabled={!session.canUndo}>Undo</button>
          <button type="button" onClick={redo} disabled={!session.canRedo}>Redo</button>
          <span className="save-status" data-status={session.saveStatus}>{status}</span>
          {session.saveStatus === 'error' && <button type="button" onClick={session.retrySave}>Try saving again</button>}
        </div>
        <ThemeSwitch choice={theme.choice} saveFailed={theme.saveFailed} onChange={theme.setChoice} announce={session.announce} />
      </header>

      <main className="app-main">
        <Notice title="Preferences are not consent">{CONSENT_NOTICE}</Notice>

        {session.saveError && (
          <p className="banner" role="alert" data-tone="error">
            {session.saveStatus === 'conflict' ? CONFLICT_HELP : session.saveError}
            {session.saveStatus === 'conflict' && (
              <button type="button" onClick={session.reloadFromStorage}>Reload latest version</button>
            )}
          </p>
        )}
        {session.actionError && <p className="banner" role="alert" data-tone="error">{session.actionError}</p>}

        <MatrixView profile={profile} run={session.run} announce={session.announce} />
        <PalettePanel profile={profile} run={session.run} announce={session.announce} />
        {managementPanels(profile.id, true)}
      </main>

      <footer className="app-footer">
        <Notice title="Where your data lives">{LOCAL_STORAGE_NOTICE}</Notice>
        <Notice title="Nothing is uploaded">{NO_UPLOAD_NOTICE}</Notice>
      </footer>

      {/* Polite live region for state changes, undo and redo. */}
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{session.announcement}</div>
    </div>
  );
}

/** Opens the real database, then renders the editor. */
export function App() {
  const [db, setDb] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    openAtlasDb().then((opened) => { if (!cancelled) setDb(opened); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return (
      <main className="app-main">
        <h1>Personal Boundaries &amp; Identity Atlas</h1>
        <p role="alert">This browser could not open its storage, so charts cannot be saved here. Private browsing modes and some strict privacy settings do this.</p>
      </main>
    );
  }
  return db ? <Atlas db={db} /> : <main className="app-main"><p role="status">Loading…</p></main>;
}
