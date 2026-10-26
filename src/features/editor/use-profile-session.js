// The live editing session for one profile (spec 9; I-13, M1-AC-06, M1-AC-07, M1-AC-13).
//
// Owns: the in-memory undo history, debounced autosave, the save status, the
// multi-tab conflict state, and switching between stored profiles.
//
// Rules this hook enforces:
// - "Saved" is reported only after the storage transaction has committed (I-13).
// - A failed save keeps the in-memory data and stays visible until it succeeds.
// - A stale revision stops saving and never overwrites the other tab's work.
// - An invalid stored record is shown, never repaired or overwritten (I-14).
import { useCallback, useEffect, useRef, useState } from 'react';
import { canRedo, canUndo, commit, createHistory, redo as redoHistory, syncRevision, undo as undoHistory } from '../../domain/history.js';
import { createStarterProfile } from '../../domain/defaults.js';
import { newId } from '../../domain/ids.js';
import { duplicateProfile } from '../../domain/profile-commands.js';
import { buildProfileFromModules } from '../../domain/profile-from-modules.js';
import {
  ConflictError, createProfile, deleteAllData, deleteProfile, listProfiles, loadProfile,
  saveProfile, setActiveProfileId, getActiveProfileId,
} from '../../storage/profile-repository.js';
import { importProfileAsNew } from '../../storage/backup.js';
import { SAVE_ERROR_HELP } from '../../content/notices.js';

const defaultNow = () => new Date().toISOString();

/**
 * @param {{
 *   db: import('idb').IDBPDatabase,
 *   now?: () => string,
 *   makeId?: (prefix: string) => string,
 *   debounceMs?: number,
 * }} options
 */
export function useProfileSession({ db, now = defaultNow, makeId = newId, debounceMs = 400 }) {
  // ---- render state ----
  const [history, setHistory] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | ready | invalid | failed
  const [profiles, setProfiles] = useState([]);
  const [invalid, setInvalid] = useState(null); // { id, error, raw }
  const [failure, setFailure] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved'); // saving | saved | error | conflict
  const [saveError, setSaveError] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const [actionError, setActionError] = useState(null);

  // ---- mutable session bookkeeping (refs, so async code never reads stale values) ----
  const historyRef = useRef(null);
  const dirtyRef = useRef(false);
  const blockedRef = useRef(false); // true after a conflict: no more saving or editing
  const timerRef = useRef(null);
  const savingRef = useRef(null);
  const generationRef = useRef(0); // bumped whenever a different profile is loaded
  const bootRef = useRef(null);
  const announceFlip = useRef(false);

  const setHistoryBoth = useCallback((next) => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const refreshProfiles = useCallback(() => {
    listProfiles(db).then(setProfiles).catch(() => { /* the list is a convenience; the editor still works */ });
  }, [db]);

  /** Politely announce a change. Alternating a trailing space lets repeats be re-read. */
  const announce = useCallback((text) => {
    announceFlip.current = !announceFlip.current;
    setAnnouncement(announceFlip.current ? `${text}\u00A0` : text);
  }, []);

  // ---- saving ----

  const flush = useCallback(async () => {
    window.clearTimeout(timerRef.current);
    if (savingRef.current) return savingRef.current; // the running pass also picks up newer edits
    if (!dirtyRef.current || blockedRef.current) return undefined;

    const pass = (async () => {
      while (dirtyRef.current && !blockedRef.current) {
        const generation = generationRef.current;
        dirtyRef.current = false;
        try {
          const stored = await saveProfile(db, historyRef.current.present);
          if (generation !== generationRef.current) return; // a different profile is now open
          setHistoryBoth(syncRevision(historyRef.current, stored.revision));
        } catch (error) {
          if (generation !== generationRef.current) return;
          dirtyRef.current = true; // still unsaved
          if (error instanceof ConflictError) {
            blockedRef.current = true;
            setSaveStatus('conflict');
            setSaveError(error.message);
          } else {
            setSaveStatus('error');
            setSaveError(SAVE_ERROR_HELP);
          }
          return;
        }
      }
      if (!dirtyRef.current) {
        setSaveStatus('saved'); // only reached after the commit resolved
        setSaveError(null);
        refreshProfiles();
      }
    })();

    savingRef.current = pass;
    try {
      await pass;
    } finally {
      savingRef.current = null;
    }
    return undefined;
  }, [db, refreshProfiles, setHistoryBoth]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus('saving');
    setSaveError(null);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { flush(); }, debounceMs);
  }, [debounceMs, flush]);

  const retrySave = useCallback(() => {
    if (blockedRef.current) return;
    dirtyRef.current = true;
    setSaveStatus('saving');
    flush();
  }, [flush]);

  // ---- loading and switching ----

  const enter = useCallback((profile) => {
    window.clearTimeout(timerRef.current);
    generationRef.current += 1;
    dirtyRef.current = false;
    blockedRef.current = false;
    setHistoryBoth(createHistory(profile));
    setInvalid(null);
    setPhase('ready');
    setSaveStatus('saved');
    setSaveError(null);
    setActionError(null);
    // The active-profile pointer is a convenience, so a failure here is not fatal.
    setActiveProfileId(db, profile.id).catch(() => {});
    refreshProfiles();
  }, [db, refreshProfiles, setHistoryBoth]);

  const showInvalid = useCallback((id, result) => {
    window.clearTimeout(timerRef.current);
    generationRef.current += 1;
    dirtyRef.current = false;
    blockedRef.current = false;
    setHistoryBoth(null);
    setInvalid({ id, error: result.error, raw: result.raw });
    setPhase('invalid');
    refreshProfiles();
  }, [refreshProfiles, setHistoryBoth]);

  /**
   * Open the preferred profile, else the newest valid one, else show the newest
   * invalid one, else create a sample profile. Never overwrites a stored record.
   */
  const selectProfile = useCallback(async (preferredId) => {
    if (preferredId) {
      const result = await loadProfile(db, preferredId);
      if (result.ok) return enter(result.profile);
      if (result.code === 'invalid') return showInvalid(preferredId, result);
    }
    const list = await listProfiles(db);
    const firstValid = list.find((p) => p.valid);
    if (firstValid) {
      const result = await loadProfile(db, firstValid.id);
      if (result.ok) return enter(result.profile);
    }
    const firstInvalid = list.find((p) => !p.valid && p.id);
    if (firstInvalid) {
      const result = await loadProfile(db, firstInvalid.id);
      if (!result.ok && result.code === 'invalid') return showInvalid(firstInvalid.id, result);
    }
    const stored = await createProfile(db, createStarterProfile({ id: makeId('profile'), now: now() }));
    return enter(stored);
  }, [db, enter, makeId, now, showInvalid]);

  // Boot once per hook instance, even if effects run twice (development double-mount).
  useEffect(() => {
    if (!bootRef.current) {
      bootRef.current = (async () => {
        try {
          await selectProfile(await getActiveProfileId(db));
        } catch {
          setFailure('This browser could not open its storage, so charts cannot be saved here. Private browsing modes and some strict privacy settings do this.');
          setPhase('failed');
        }
      })();
    }
  }, [db, selectProfile]);

  // Flush on tab hide and page hide, and on unmount (spec 9).
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    const onPageHide = () => { flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
  }, [flush]);

  // ---- editing ----

  /**
   * Apply a domain command. Returns the command's result so callers can react to it.
   * @param {(profile: object, args: object, now: string) => { ok: boolean, profile?: object, error?: string }} command
   * @param {object} args
   * @param {{ group?: string|null }} [options] consecutive edits with one group share an undo step
   */
  const run = useCallback((command, args, { group = null } = {}) => {
    const current = historyRef.current;
    if (!current) return { ok: false, error: 'No profile is open.' };
    if (blockedRef.current) {
      const error = 'Editing is paused because this profile changed in another tab. Reload to continue.';
      setActionError(error);
      return { ok: false, error };
    }
    const result = command(current.present, args, now());
    if (!result.ok) {
      setActionError(result.error);
      return result;
    }
    setActionError(null);
    if (result.profile !== current.present) {
      setHistoryBoth(commit(current, result.profile, { group }));
      markDirty();
    }
    return result;
  }, [markDirty, now, setHistoryBoth]);

  const undo = useCallback(() => {
    const current = historyRef.current;
    if (!current || blockedRef.current || !canUndo(current)) return;
    setHistoryBoth(undoHistory(current, now()));
    setActionError(null);
    markDirty();
    announce('Undone');
  }, [announce, markDirty, now, setHistoryBoth]);

  const redo = useCallback(() => {
    const current = historyRef.current;
    if (!current || blockedRef.current || !canRedo(current)) return;
    setHistoryBoth(redoHistory(current, now()));
    setActionError(null);
    markDirty();
    announce('Redone');
  }, [announce, markDirty, now, setHistoryBoth]);

  // ---- profile management ----

  /** Switch profiles. Refuses while the current profile has changes that failed to save. */
  const switchProfile = useCallback(async (id) => {
    await flush();
    if (dirtyRef.current && !blockedRef.current) {
      setActionError('Your latest changes could not be saved yet. Try saving again, or download a backup, before switching.');
      return false;
    }
    await selectProfile(id);
    return true;
  }, [flush, selectProfile]);

  const createNewProfile = useCallback(async (title) => {
    const cleaned = typeof title === 'string' ? title.trim() : '';
    if (cleaned === '' || cleaned.length > 120) {
      setActionError('Give the profile a name of 120 characters or fewer.');
      return false;
    }
    await flush();
    if (dirtyRef.current && !blockedRef.current) {
      setActionError('Your latest changes could not be saved yet. Try saving again, or download a backup, first.');
      return false;
    }
    const stored = await createProfile(db, createStarterProfile({ id: makeId('profile'), now: now(), title: cleaned }));
    enter(stored);
    return true;
  }, [db, enter, flush, makeId, now]);

  /** Start a NEW profile that holds only the chosen modules, and open it (M3-06, I-12). */
  const createProfileFromModules = useCallback(async ({ title, templates, acknowledgeAdult = false }) => {
    const built = buildProfileFromModules({ id: makeId('profile'), title, templates, acknowledgeAdult, makeId }, now());
    if (!built.ok) {
      setActionError(built.error);
      return false;
    }
    await flush();
    if (dirtyRef.current && !blockedRef.current) {
      setActionError('Your latest changes could not be saved yet. Try saving again, or download a backup, first.');
      return false;
    }
    const stored = await createProfile(db, built.profile);
    enter(stored);
    return true;
  }, [db, enter, flush, makeId, now]);

  /** Store a copy of the open profile as a NEW profile and open it. The original is not changed (I-12). */
  const duplicateCurrentProfile = useCallback(async () => {
    const current = historyRef.current?.present;
    if (!current) return false;
    await flush();
    if (dirtyRef.current && !blockedRef.current) {
      setActionError('Your latest changes could not be saved yet. Try saving again, or download a backup, before copying.');
      return false;
    }
    if (blockedRef.current) {
      setActionError('Editing is paused because this profile changed in another tab. Reload to continue.');
      return false;
    }
    const copy = duplicateProfile(historyRef.current.present, { id: makeId('profile') }, now());
    if (!copy.ok) { setActionError(copy.error); return false; }
    const stored = await importProfileAsNew(db, copy.profile, { makeId: () => makeId('profile') });
    enter(stored);
    return true;
  }, [db, enter, flush, makeId, now]);

  /** Save an already-validated imported profile as a NEW profile and open it (I-12). */
  const importProfile = useCallback(async (profile) => {
    await flush();
    const stored = await importProfileAsNew(db, profile, { makeId: () => makeId('profile') });
    enter(stored);
    return stored;
  }, [db, enter, flush, makeId]);

  const removeProfile = useCallback(async (id) => {
    await deleteProfile(db, id);
    const wasActive = historyRef.current?.present.id === id || invalid?.id === id;
    if (wasActive) await selectProfile(null);
    else refreshProfiles();
  }, [db, invalid, refreshProfiles, selectProfile]);

  const removeEverything = useCallback(async () => {
    window.clearTimeout(timerRef.current);
    dirtyRef.current = false;
    await deleteAllData(db);
    await selectProfile(null);
  }, [db, selectProfile]);

  /** After a conflict (or deletion elsewhere): discard this tab's copy and load what is stored. */
  const reloadFromStorage = useCallback(async () => {
    await selectProfile(historyRef.current?.present.id ?? null);
  }, [selectProfile]);

  const profile = history?.present ?? null;

  return {
    phase, profile, profiles, invalid, failure,
    saveStatus, saveError, announcement, actionError,
    canUndo: history ? canUndo(history) : false,
    canRedo: history ? canRedo(history) : false,
    run, undo, redo, announce, retrySave, flush,
    switchProfile, createNewProfile, createProfileFromModules, duplicateCurrentProfile, importProfile, removeProfile, removeEverything, reloadFromStorage,
    dismissActionError: () => setActionError(null),
  };
}
