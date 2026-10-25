// Theme hook (M2-04). Loads the saved choice, applies it to <html> as a data-theme
// attribute, and saves changes. The attribute is set from script, which the CSP allows
// (`script-src 'self'`); no inline script or inline style is involved.
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadThemeChoice, saveThemeChoice } from '../../storage/preferences.js';

/**
 * Put a theme on the page. `system` removes the attribute so the device setting decides.
 * @param {string} choice
 * @param {HTMLElement} [root]
 */
export function applyTheme(choice, root = document.documentElement) {
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/**
 * @param {import('idb').IDBPDatabase} db
 * @returns {{ choice: string, saveFailed: boolean, setChoice: (next: string) => Promise<void> }}
 */
export function useTheme(db) {
  const [choice, setChoiceState] = useState('system');
  const [saveFailed, setSaveFailed] = useState(false);
  const changedByPerson = useRef(false); // a slow load must not overwrite a choice made meanwhile

  useEffect(() => {
    let cancelled = false;
    loadThemeChoice(db)
      .then((saved) => { if (!cancelled && !changedByPerson.current) setChoiceState(saved); })
      .catch(() => { /* an unreadable preference just means "follow the device" */ });
    return () => { cancelled = true; };
  }, [db]);

  useEffect(() => { applyTheme(choice); }, [choice]);

  const setChoice = useCallback(async (next) => {
    changedByPerson.current = true;
    setChoiceState(next);
    try {
      await saveThemeChoice(db, next);
      setSaveFailed(false);
    } catch {
      // The theme still applies for this visit, but the person is told it will not last (I-13).
      setSaveFailed(true);
    }
  }, [db]);

  return { choice, saveFailed, setChoice };
}
