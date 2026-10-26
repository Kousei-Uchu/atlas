// Fixed wording for the notices the spec requires (spec 14.2, 9, 10.1).
// Kept in one place so tests can assert the exact text and so copy is never
// reworded by accident in a component.

/** I-02: shown in the editor and, from M4, in every export. */
export const CONSENT_NOTICE =
  'A chart shows general preferences. It is not permission, and it does not replace asking. If someone says no or changes their mind, that comes first.';

/** D-009: shown each time an adult-intended module is turned on. No age is asked for or stored. */
export const ADULT_MODULE_NOTICE =
  'This module covers relationships, intimacy, attraction or the body, and it is intended for adults. The app does not ask for your age and does not store it. Turn it on only if it is right for you. You can hide it again at any time, and your answers stay saved.';

export const LOCAL_STORAGE_NOTICE =
  'Your charts are stored in this browser on this device. Clearing browser data, using private browsing, or switching device can remove them. Export a backup regularly. Other people who use this browser profile may be able to read them.';

export const NO_UPLOAD_NOTICE =
  'Nothing you enter is sent anywhere. The app has no accounts and no analytics.';

/** Shown next to the backup export button, so it is never mistaken for a shared view. */
export const BACKUP_NOTICE =
  'A full backup contains everything in this profile, including every note. It is not encrypted. Keep it somewhere private.';

/** Shown when the person is about to import a file. */
export const IMPORT_NOTICE =
  'Importing always creates a new profile. Your existing profiles are not changed.';

/** Save status text (spec 9). "Saved" is only ever shown after the write has committed (I-13). */
export const SAVE_STATUS_TEXT = Object.freeze({
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save',
  conflict: 'Not saved: this profile changed in another tab',
});

export const SAVE_ERROR_HELP =
  'Your changes are still on this page, but they have not been stored. Try saving again, or download a backup.';

export const CONFLICT_HELP =
  'This profile changed in another tab, so this tab has stopped saving to avoid overwriting that work. You can download this tab\u2019s copy first, then reload to see the latest version. Reloading discards the changes made in this tab.';

export const DELETE_ALL_DESCRIPTION =
  'This permanently removes every profile, answer and note stored by this app in this browser, and the saved choice of active profile. It does not touch backup files you have downloaded. A fresh sample profile is created afterwards. This cannot be undone.';
