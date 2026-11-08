// Chooses between the app and a shared-chart preview, from the URL fragment (D-016, D-017; M5-02).
// A share link is read before the app opens any storage, so opening one never touches local data.
import { useState } from 'react';
import { App } from './App.jsx';
import { SharedChartPage } from '../features/share/SharedChartPage.jsx';
import { readFragment } from '../share/fragment.js';
import { openAtlasDb } from '../storage/database.js';
import { importProfileAsNew } from '../storage/backup.js';
import { setActiveProfileId } from '../storage/profile-repository.js';
import { newId } from '../domain/ids.js';

/** Drop the fragment from the address bar without adding a history entry. */
export function clearFragment() {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

export function Root() {
  const [fragment, setFragment] = useState(() => readFragment(window.location.hash));
  if (fragment.kind === 'none') return <App />;

  const leave = () => { clearFragment(); setFragment({ kind: 'none' }); };
  const saveCopy = async (profile) => {
    const db = await openAtlasDb();
    const stored = await importProfileAsNew(db, profile, { makeId: () => newId('profile') });
    await setActiveProfileId(db, stored.id).catch(() => {});
    db.close();
    leave();
  };
  return <SharedChartPage fragment={fragment} onSaveCopy={saveCopy} onLeave={leave} />;
}
