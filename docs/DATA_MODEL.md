# Data model (schema version 1)

The specification in `ATLAS_SPEC_AND_PROGRESS.md` section 5 is the source of truth for fields and limits. This file explains how the model is used, and where each rule is enforced.

## Shape

One profile is one stored record (one aggregate): settings, states, categories, items, answers, audiences, overrides and views. Audiences, overrides and views are validated now but have no behaviour until M4.

| Part | Purpose | Code |
|---|---|---|
| `states` | Meaning, label, colour, icon, pattern and cycle position of each answer | `domain/schema.js`, `domain/defaults.js` |
| `categories` | Sections, up to 3 levels deep. Carry a sensitivity floor and visibility | `domain/schema.js` |
| `items` | Definitions only: label, type, sensitivity, template origin | `domain/schema.js` |
| `answers` | One record per answered item: state or text, plus note | `domain/schema.js` |

## Rules worth knowing

- **Answers are separate from items (D-011).** Changing a state's label or colour never touches answers, because answers hold a stable state ID (I-03).
- **No record means Unanswered (D-012, I-01).** `effectiveStateId` returns `unanswered` for a missing answer and for an answer pointing at a missing state. Setting Unanswered deletes the answer, or keeps a note-only record. A stored answer that names `unanswered` is rejected.
- **Effective sensitivity is the higher of item and category (D-015).** `selectors.effectiveSensitivity`.
- **Notes belong to the answer.** `noteShareable` defaults to false, and clearing a note resets it.
- **`revision` belongs to storage.** The repository increments it on each save. Undo and redo keep the live revision, so a save after undo never conflicts with itself.
- **Order is deterministic:** `sortOrder`, then `id`.
- **Every ID is checked:** category parents, item categories, answer items and states, override and view references, with no duplicates and no category cycles. `domain/validation.js`.

## Storage

IndexedDB database `atlas-db` version 1.

| Store | Key | Holds |
|---|---|---|
| `profiles` | `id` | One validated profile per record |
| `settings` | `key` | The active profile ID |

Saves run in one read-write transaction and compare `revision`. A mismatch, a deleted profile, or a record from a different schema version raises `ConflictError`, and nothing is overwritten. An invalid stored record is listed and can be exported raw, but is never modified (I-14).

## Backup file

```json
{ "format": "atlas-backup", "formatVersion": 1, "kind": "full-profile", "exportedAt": "...", "profile": { } }
```

Import is size-checked, parsed in isolation, validated, previewed, and saved as a **new** profile only (I-12). If the profile ID is taken, a new profile ID is assigned and every other ID is kept. A raw-record export uses format `atlas-raw-record` and is not importable.

## Changing the model

Any change to stored shape needs a new `schemaVersion`, an explicit tested migration from N to N+1, and a failure path that leaves the original record intact (spec 9). Until then, version 1 data from a newer app is rejected, never trimmed.
