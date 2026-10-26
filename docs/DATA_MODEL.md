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
- **Order is deterministic:** `sortOrder`, then `id`. Moving an item or category (`domain/order-commands.js`) renumbers its siblings 10, 20, 30... and changes nothing else (D-031).
- **Bulk changes are built from the single-item commands** (`domain/bulk-commands.js`), so one rule set covers one item or many. Moving items to another category keeps each item's effective sensitivity at least what it was (D-032).
- **A copy of a profile is a new record** with a new profile id and revision 0; ids inside it are kept, because they only need to be unique within a profile (D-033).
- **Search and filters are display only.** `domain/search.js` narrows what is shown and never edits or stores anything; the filter lives in component state and is not saved (D-030).
- **Every ID is checked:** category parents, item categories, answer items and states, override and view references, with no duplicates and no category cycles. `domain/validation.js`.

## The palette (M2)

States are edited through `domain/palette-commands.js`.

- Name, colour, icon, pattern and description never touch answers (I-03).
- A state is either in the click cycle, with a unique `cycleOrder`, or menu only (`cycleOrder: null`). New states start menu only. Unanswered always stays in the cycle.
- Removing a state asks what to do with answers and overrides that use it: clear them, or move them to a state that is no more permissive (D-026, decision 0005).
- State names are unique ignoring case (D-027).

## Click behaviour (M2)

Two profile settings decide what a click does: `settings.interaction.primaryDirection` (`negative` or `positive`) and `settings.cycle.endBehaviour` (`clamp` or `loop`). They are changed through `domain/settings-commands.js` and read by `stepItemState`.

- They belong to the profile, so a backup and a copy carry them. The theme does not: it is a device preference (D-029).
- They change what the next click does and never touch a saved answer (I-03).
- A secondary click always moves the opposite way to a primary click.
- Choosing the value that is already set returns the same profile, so it adds no undo step.

## Templates (M3)

A template is a bundled data file in `src/content/templates/`, checked by `domain/templates.js`. It holds categories and items only, never answers.

- `templateId` and `version` identify it. Categories and items made from it carry `origin: { templateId, templateVersion, key }`.
- `key` is unique across the whole template and never changes after release. Reset and update match on it, so renaming a label does not break the link.
- An item with no sensitivity of its own takes its category's.
- A template with restricted content must be `adultIntended` and hidden by default.
- Templates are not part of a profile or a backup. Only the `origin` records are.

See `src/content/templates/README.md` for how to write one.

### Modules in a profile

A module is a template that has been added to a profile. There is no separate record for it. A module is present when any category has `origin.templateId` equal to the template's id, and `metadata.templateIds` lists the ids that have been added.

- Showing and hiding a module sets `visibility` on all of its categories. Hidden categories and their items stay in the profile with their answers, and the chart leaves them out.
- A module cannot be added twice.
- **Update** adds what a newer template has and the profile lacks, and records the new `templateVersion` on every entry. **Reset** also puts the template's wording and order back. Both find entries by `origin.key`, keep every answer and note, keep what the person added and what the template no longer has, never change an item's type, and never lower a sensitivity level (D-038).
- A new profile can be started from chosen modules. It is built from a blank profile (default states and settings, no categories) by adding each module in turn (D-039).
- Turning on an adult-intended module needs the adult note to be acknowledged each time. That sets `settings.restrictedModulesAcknowledged` to `true`. No age is asked for or stored (D-009).

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
