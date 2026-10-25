# Personal Boundaries & Identity Atlas
## Unified Specification and Progress Tracker

| | |
|---|---|
| **Status** | Semi-final. Requirements are settled; items marked **OPEN** still need a decision. |
| **Version** | 0.3.0 |
| **Date** | 2026-10-26 |
| **Supersedes** | `personal_boundaries_identity_atlas_spec.md` v0.1.0 and `personal_boundaries_identity_atlas_implementation_plan.md` v0.1.0 (both remain as background; where they disagree with this document, this document wins) |
| **Repository** | `personal-boundaries-identity-atlas` (GitHub, deployed to Vercel as a static site) |
| **Language/stack** | JavaScript (JSDoc types), React, Vite, Zod, `idb`, Vitest, Playwright |

How to use this document: sections 1 to 16 are the specification. Section 17 is the live progress tracker. Section 18 is the risk register, section 19 the open questions, section 20 the change log. Tick boxes in section 17 only when the acceptance criteria listed beside them have passed.

---

## 1. Product summary

A privacy-first, local-first web app for creating, customising and selectively sharing personal preference charts: names and pronouns, physical contact and personal space, communication, emotional support, sensory needs, privacy, relationships and affection, intimacy boundaries, attraction, anatomy and compatibility, gender expression, work and school preferences, and conflict repair.

Core model: **one private master profile, many tailored views.** A preference is stored once. Audience-specific views resolve it, filter it, and export only what the user selected. Nothing leaves the device unless the user explicitly exports or shares it.

Non-goals (unchanged from the spec): no diagnosing, no assigning or suggesting identity labels, no inferring consent, no ranking of identities or boundaries, no required completion, no accounts, no server-side chart storage, no telemetry.

---

## 2. Invariants (non-negotiable)

Every invariant has an enforcing test. A change that breaks one is a bug, not a trade-off.

| ID | Invariant | Enforced by |
|---|---|---|
| I-01 | Unanswered is never treated as yes, permission or acceptance. Missing data resolves to "Unanswered". | `selectors.effectiveStateId`, state-cycle tests, import/migration tests |
| I-02 | A stored preference never overrides a present refusal or withdrawal of consent. Because this cannot be computed from static data, every export format and the editor carry a fixed statement saying so. | Notice component test, export snapshot tests (M4+) |
| I-03 | State meaning is separate from colour and from cycle order. Changing a label or colour never changes stored answers (answers reference stable state IDs). | Schema, command tests |
| I-04 | Audience overrides never modify the underlying default answer. | Resolution tests (M4) |
| I-05 | Building a view or export never mutates the master profile. | Immutability tests (frozen inputs) |
| I-06 | No profile data is uploaded. No telemetry, no analytics, no third-party scripts, fonts or CDNs. | CSP `connect-src 'none'`, e2e request audit, dependency review, `no-console` lint rule |
| I-07 | A self-contained URL is a bearer copy of the data. It is not private, secret or encrypted, and the UI never claims otherwise. | Copy review, UI text tests (M5) |
| I-08 | All imported and URL-decoded data is untrusted: size-limited, validated, never executed, rendered as text only. | Validation and import test suites |
| I-09 | Colour is never the only indicator of a state. Every state has a text label plus an icon or border. | Component and axe tests |
| I-10 | Identity, attraction and anatomy tools only record what the user supplies. No label is ever assigned or suggested automatically. Anatomy is never a proxy for gender identity, and templates and views never couple the two. | Template schema tests (M3) |
| I-11 | Shared exports contain only the selected information. Restricted items need per-item opt-in. Notes are excluded unless explicitly shared. | Export-selection tests (M4) |
| I-12 | Opening or importing data never overwrites an existing profile. Import always creates a new profile. | Backup tests |
| I-13 | A failed write is visible. "Saved" is shown only after the storage transaction commits. | Repository and component tests |
| I-14 | Unknown or newer-version data is never silently dropped. It is rejected with a readable message that lists the problem. | Validation tests |

---

## 3. Decision log

### 3.1 Resolved

| ID | Decision | Source |
|---|---|---|
| D-001 | Standalone repo `personal-boundaries-identity-atlas`, hosted on GitHub, deployed to Vercel as a static site. No backend. | User |
| D-002 | JavaScript with JSDoc, React + Vite. No TypeScript at this stage. | Plan, user constraint |
| D-003 | Click direction: primary (left) click moves toward the negative end of the configured cycle; secondary (right) click moves toward the positive end. Configurable per profile. | User |
| D-004 | End-of-cycle behaviour: **clamp** by default; **loop** available as a setting. | User delegated; Claude chose |
| D-005 | The cycle uses only the configured set states. There is no special "tentative" entry click. | User |
| D-006 | **Unanswered is a fixed member of the cycle** (user-reorderable, not removable) so a click always moves exactly one step along the configured order. Default order: No, Unsure, Unanswered, Conditional, Yes. "Not applicable" is selectable from the picker but sits outside the cycle. | Derived from D-003/D-005 |
| D-007 | Leaving an off-cycle state (for example "Not applicable") by click returns to the Unanswered position, never to a positive or negative state. | Claude |
| D-008 | Intimacy, attraction, anatomy, gender-expression and relationship modules are in scope from the start of the template work (M3), with all contact templates, including semi-intimate platonic contact between friends. They default to the `restricted` sensitivity level and are hidden until the user enables them. | User |
| D-009 | A short, local-only "intended for adults" note appears when enabling restricted modules. No age is collected or stored. | Claude (user may veto) |
| D-010 | The user reviews template wording (data files) before the template milestone merges. | Claude |
| D-011 | Answers are stored separately from item definitions. Notes live on the answer record. Items carry template-origin metadata so templates can be reset or updated without losing answers. | Spec §14.3 |
| D-012 | Absence of an answer record means Unanswered. Setting a state to Unanswered deletes the record (or clears its state when a note remains). | Claude |
| D-013 | No numeric `priority` on rules. Duplicate overrides for the same item and audience are reported as a conflict, never resolved by ordering. | Spec §6.4 |
| D-014 | Views are an explicit allowlist of item IDs. An empty list shares nothing. Category toggles in the UI only write item IDs. New items never appear in an existing view automatically. | Claude |
| D-015 | Four sensitivity levels: `normal`, `personal`, `sensitive`, `restricted`. An item's effective level is the higher of its own level and its category's level. | Claude |
| D-016 | A share URL opens as a read-only preview with a "Save a copy" action (resolves spec Q6). Opening a URL never touches the local profile. | Claude |
| D-017 | The share URL uses the fragment form `#atlas=<prefix>.<payload>` at the site root. Single format version in the prefix. No hash routing anywhere in the app. | Claude |
| D-018 | The share format has its own schema and version, independent of the internal storage schema. | Spec §10.5 |
| D-019 | Within one schema version, unknown fields on import cause rejection with a list of the offending fields. A newer schema version is rejected with an "update the app" message. | Claude |
| D-020 | Password-protected export is deferred (M8). Until then the UI says plainly that exports are not encrypted. | Plan §8.5 |
| D-021 | Interaction defaults: tap, Enter and Space perform the primary action; Shift+Enter and Shift+Space perform the secondary action; every row also has a labelled state picker (a native `<select>`), which also works as the right-click alternative. | Claude |
| D-022 | UI spelling is UK/Australian English (colour, customise), matching the spec. | Claude |
| D-023 | Browser baseline: current and previous major versions of Chrome, Edge, Firefox and Safari (including iOS Safari), served over HTTPS or localhost. | Claude |
| D-024 | Production builds ship a CSP meta tag and `vercel.json` response headers with `connect-src 'none'`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`. | Claude |
| D-025 | Undo/redo is an in-memory history of up to 100 entries with structural sharing. It is not persisted across reloads. Note edits are grouped per field. | Claude |
| D-026 | Removing a state asks what to do with answers that use it: clear them (default) or move them to a state that is no more permissive. Moving to a more permissive state is refused, so removing a state can never turn a stored No, Unsure or Not applicable into a Conditional or Yes. Overrides follow the same choice. | Claude (user may veto) |
| D-027 | State names must be unique, ignoring case, so two states are never told apart by colour alone. New states start outside the click cycle (picker only) unless the person adds them to it. The meaning of the built-in Unanswered state is fixed; its name and look can change. | Claude (user may veto) |
| D-028 | Colour contrast is advice only. A state's text and border colour is compared with its background (WCAG 2.x; 4.5 to 1 for text, 3 to 1 for icons and borders). A weak pair shows a warning in words with the ratio, never blocks saving, and never changes the stored colours. | Claude (user may veto) |
| D-029 | The theme (device, light, dark, high contrast) is a device preference stored in the `settings` store, not in the profile, so it is never in a backup. High contrast replaces each state's custom colours with the theme's own, keeping label, icon and pattern. A non-system theme may flash briefly on load because the CSP forbids an inline early script. | Claude (user may veto) |
| D-030 | Search looks at an item's label, description and tags and at the names of the categories it sits in. It does not search notes or written answers. Every word typed must match (any order, ignoring case and accents). The category filter shows one category and everything beneath it. While any filter is on, moving rows is off, and adding items is off while a search is typed, so the visible list is never mistaken for the whole list. | Claude (user may veto) |
| D-031 | Rows are reordered with Up and Down buttons (drag is left out for now). Items move within their category; categories move among their siblings and step over hidden ones. Each move renumbers the siblings 10, 20, 30... so tied or odd values can never hide a move. Order never touches answers (I-03). Moving an item to a different category is part of bulk change (M2-07). | Claude (user may veto) |
| D-032 | Bulk changes (state, category, note) act only on items that are both selected and currently shown, ask for confirmation that says how many items change and how many do not, and are one undo step. A bulk state change to a positive or conditional state says that a saved answer is never consent. Moving items to another category never lowers their sensitivity: the item keeps at least the level it effectively had, and items cannot be moved into a hidden category. | Claude (user may veto) |
| D-033 | "Make a copy" creates a separate profile (new profile id, revision 0, title "Copy of ...") with everything else as it was, saves the open profile first, and never changes the original (I-12). Renaming is an ordinary undoable edit. The storage display gives the open profile's size and the browser's own estimate for the site, both labelled as estimates, and says so plainly when the browser gives none. | Claude (user may veto) |

### 3.2 Open

See section 19.

---

## 4. Technology and repository

### 4.1 Stack

| Concern | Choice |
|---|---|
| UI | React (function components), plain CSS with design tokens |
| Build | Vite, static output |
| Types | JavaScript with JSDoc |
| Validation | Zod (`strictObject` schemas) plus hand-written integrity checks |
| Storage | IndexedDB via `idb` |
| Tests | Vitest, Testing Library, `fake-indexeddb`; Playwright and `@axe-core/playwright` for end-to-end |
| Lint | ESLint with `react-hooks` and `jsx-a11y`; `no-console` is an error |
| Share compression (M5) | `fflate` using the streaming inflater with a byte budget |
| QR (M5) | A small local QR library, chosen at M5 |
| Hosting | Vercel static, headers in `vercel.json` |

Runtime dependencies for M1 are exactly: `react`, `react-dom`, `zod`, `idb`. All dependencies are pinned to exact versions. Packages are added only when a milestone needs them.

### 4.2 Layout

```text
personal-boundaries-identity-atlas/
  index.html
  package.json
  vite.config.js
  eslint.config.js
  playwright.config.js
  vercel.json
  README.md
  docs/
    ATLAS_SPEC_AND_PROGRESS.md
    PRODUCT_SPEC.md
    IMPLEMENTATION_PLAN.md
    decisions/
  src/
    main.jsx
    app/            App.jsx, app.css
    domain/         limits, ids, schema, defaults, state-cycle, validation,
                    selectors, commands, history
    storage/        database, profile-repository, backup
    features/       editor/, import-export/, settings/
    visualizations/ matrix/
    components/     StateBadge, StatePicker, ConfirmDialog
    content/        notices.js
    styles/         tokens.css, base.css, accessibility.css
  tests/            domain/, storage/, components/, e2e/
  .github/workflows/checks.yml
```

### 4.3 Layer rules

- `domain/` is plain JavaScript. It imports no React and no browser storage, and has no side effects.
- `storage/` persists validated domain data and never decides its meaning.
- `features/` owns workflows and screen state. `visualizations/` render a view model and never mutate the profile.
- Imported and decoded data goes through `domain/validation` before reaching storage or UI.
- No catch-all `utils.js`.

### 4.4 Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build (injects CSP meta tag) |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest, single run |
| `npm run test:e2e` | Playwright against the production build |
| `npm run verify` | lint, test, build |

### 4.5 Response headers (`vercel.json`)

Content-Security-Policy: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'`. Also `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` disabling camera, microphone, geolocation. `worker-src 'self'` and a revised `connect-src` are reviewed when the service worker arrives (M6). No rewrites are needed because the app has no path routes.

---

## 5. Domain model (schema version 1)

All objects are validated with strict schemas. IDs match `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`.

### 5.1 Profile

```json
{
  "schemaVersion": 1,
  "id": "profile_...",
  "revision": 0,
  "title": "My profile",
  "description": "",
  "createdAt": "ISO-8601 UTC",
  "updatedAt": "ISO-8601 UTC",
  "settings": {
    "cycle": { "endBehaviour": "clamp" },
    "interaction": { "primaryDirection": "negative" },
    "restrictedModulesAcknowledged": false
  },
  "states": [],
  "categories": [],
  "items": [],
  "answers": [],
  "audiences": [],
  "overrides": [],
  "views": [],
  "metadata": { "templateIds": [] }
}
```

`revision` is a storage concurrency counter, incremented by the repository on every successful save.

### 5.2 State

| Field | Type | Notes |
|---|---|---|
| `id` | id | Stable. Never reused. |
| `label` | string ≤ 60 | Shown as text everywhere. |
| `description` | string ≤ 300 | |
| `color` | `#RRGGBB` | Display only. |
| `textColor` | `#RRGGBB` | |
| `icon` | enum | `check`, `cross`, `question`, `tilde`, `dash`, `circle`, `dot`, `star`, `heart`, `pause` |
| `pattern` | enum or null | `solid`, `stripes`, `dots`, `dashed` (border style) |
| `cycleOrder` | integer or null | Null means "picker only". |
| `semantic` | enum | `positive`, `conditional`, `negative`, `uncertain`, `neutral`, `not-applicable`. Used for safety checks only, never for ordering. |
| `isUnanswered` | boolean | True only for the system state `unanswered`. |
| `isSystem` | boolean | System states cannot be deleted. |
| `isSelectable` | boolean | |

Default states:

| id | label | semantic | icon | cycleOrder |
|---|---|---|---|---|
| `no` | No | negative | cross | 10 |
| `unsure` | Unsure | uncertain | question | 20 |
| `unanswered` | Unanswered (system) | neutral | circle (dashed border) | 30 |
| `conditional` | Conditional | conditional | tilde | 40 |
| `yes` | Yes | positive | check | 50 |
| `not-applicable` | Not applicable | not-applicable | dash | none |

State invariants: IDs unique; exactly one state with `isUnanswered: true` and id `unanswered`; it must have a non-null `cycleOrder`; non-null cycle orders are unique; `unanswered` must keep a non-positive semantic (`neutral`); at most 24 states.

### 5.3 Category

`id`, `name` ≤ 120, `description` ≤ 500, `parentId` or null, `sortOrder`, `visibility` (`visible` or `hidden`), `sensitivity` (floor for its items), `origin` (`{templateId, templateVersion, key}` or null). No cycles; depth ≤ 3. A `hidden` category is not shown in the editor until enabled. It is not deleted.

### 5.4 Item

`id`, `categoryId`, `type` (`state` or `text`; further types in M8), `label` ≤ 200, `description` ≤ 500, `sortOrder`, `sensitivity`, `tags` (≤ 10, each ≤ 40), `origin` (as above). Items hold definitions only; no answers.

### 5.5 Answer

`itemId` (unique across answers), `stateId` (for `state` items; never `unanswered`), `text` ≤ 4000 (for `text` items), `note` ≤ 4000, `noteShareable` (default false). A record with no state, text or note is removed. Notes are user data and belong to the answer, not the item.

### 5.6 Audience, override, view (schemas in M1, behaviour in M4)

- **Audience:** `id`, `name`, `type` (`everyone`, `public`, `acquaintances`, `friends`, `close-friends`, `partner`, `family`, `school-work`, `supervisor`, `professional`, `group`, `individual`), `description`, `parentId` (reserved; unused until inheritance is added).
- **Override:** `id`, `itemId`, `audienceId`, `stateId`, `enabled`, `explanation`. No priority. Two enabled overrides for the same item and audience are a conflict.
- **View:** `id`, `name`, `audienceId` or null, `includedItemIds`, `includeSensitive`, `restrictedOptInItemIds`, `includeNotes`, `visualization {type, options}`.

Inclusion rule for an item in a view: the item must be in `includedItemIds`, and then its effective sensitivity must be `normal` or `personal`, or `sensitive` with `includeSensitive: true`, or `restricted` and listed in `restrictedOptInItemIds`. A note is included only if `includeNotes` is true and the answer has `noteShareable: true`.

### 5.7 Integrity rules

- Every referenced ID exists (category parent, item category, answer item and state, override item, audience and state, view item IDs).
- IDs are unique within each collection.
- Answer type matches item type; a state answer must reference a selectable, non-`unanswered` state.
- Sorting is deterministic: `sortOrder`, then `id`.
- JSON containing `__proto__`, `constructor` or `prototype` keys is rejected.

### 5.8 Limits (constants in `src/domain/limits.js`)

| Limit | Value |
|---|---|
| Backup file size | 4 MiB |
| Items per profile | 2,000 |
| Categories per profile | 200 (depth ≤ 3) |
| States per profile | 24 |
| Audiences / overrides / views | 50 / 5,000 / 50 |
| Label length | 200 |
| Note or text length | 4,000 |
| JSON nesting depth | 12 |
| Undo history | 100 entries |
| Share URL, encoded (M5) | 256 KiB |
| Share URL, decompressed (M5) | 2 MiB |

---

## 6. State engine

### 6.1 Cycle

`getNextState(currentStateId, states, direction, { endBehaviour })`

- The cycle is every state with a non-null `cycleOrder`, sorted by `cycleOrder` then `id`.
- `direction` is `negative` or `positive`. The UI maps primary and secondary clicks to directions through the profile's `interaction.primaryDirection` setting.
- If the current state is in the cycle, move one step in the direction.
- At an end: `clamp` returns the same state (and the UI announces "already at the end"); `loop` wraps.
- If the current state is not in the cycle, the result is `unanswered` (D-007).
- Invalid configuration (no `unanswered` in the cycle, duplicate orders, unknown current state) returns `{ ok: false, error }`. It never throws and never guesses.
- The function returns `{ ok: true, stateId }`. It never depends on colour or labels.

### 6.2 Default behaviour table

| From | Negative step | Positive step |
|---|---|---|
| Yes | Conditional | Yes (clamp) |
| Conditional | Unanswered | Yes |
| Unanswered | Unsure | Conditional |
| Unsure | No | Unanswered |
| No | No (clamp) | Unsure |
| Not applicable | Unanswered | Unanswered |

---

## 7. Audience resolution (M4)

Version 1 resolves direct overrides only:

1. An enabled override for (item, audience) wins.
2. Otherwise the item's answer state is used.
3. Otherwise Unanswered.

The result is `{ stateId, source }` with `source` in `override | answer | unanswered`, so the UI can always say why a value appears. Duplicate enabled overrides yield `{ conflict: [...] }` and the view shows the conflict; nothing is chosen on the user's behalf. Parent-audience inheritance, category-level overrides, conditions, time windows, and temporary restrictions follow the spec §6.4 precedence list and are added only after M4 has real usage (M8). No "most permissive wins" rule exists anywhere.

---

## 8. Interaction and accessibility

- Every state cell is a `<button>` whose accessible name contains the item label and the state text. State is shown by label, icon and border pattern as well as colour.
- Primary click, tap, Enter and Space perform the primary action. Secondary click and Shift+Enter or Shift+Space perform the secondary action. The context menu is suppressed on state cells only. A labelled picker (native `<select>`) lets any user set any state directly, with the native touch picker on phones.
- State changes are announced through a polite live region, including "already at the end" for clamped steps.
- Undo and redo have visible buttons and the standard shortcuts.
- Focus is always visible. Tab order follows reading order. Targets are at least 44 px. Layout is responsive; tables become stacked rows on narrow screens, with every item and state still reachable.
- Honour `prefers-reduced-motion`, `prefers-contrast` and `forced-colors`. A manual high-contrast theme and contrast-ratio warnings for custom colours arrive in M2.
- Plain, literal language. Progressive disclosure for advanced options. Hidden modules can be shown or hidden at any time.

---

## 9. Storage, autosave and recovery

- IndexedDB database `atlas-db`, version 1: store `profiles` (key `id`) and store `settings` (key `key`, holds the active profile ID).
- A profile is one validated aggregate. Saves run in a single read-write transaction and compare the stored `revision` with the expected one. A mismatch raises `ConflictError`; the UI shows "This profile changed in another tab" with a reload action and does not overwrite.
- Autosave is debounced (about 400 ms) and also flushes on `visibilitychange` and `pagehide`. Status is `Saving…`, `Saved`, or `Could not save`, and `Saved` appears only after the commit resolves. A failed save keeps the in-memory data and leaves the status visible.
- On load, an invalid stored record is never overwritten. The app reports the problem and offers to export the raw record.
- The UI states that browser storage is not a backup and is readable by other users of the same browser profile. A "Delete all local data" action requires confirmation and says exactly what it removes.
- Persistent storage is requested only after a user action, never on load.
- Migrations are explicit, tested functions from version N to N+1. A failed migration leaves the original record intact and offers a downloadable copy.

---

## 10. Import and export

### 10.1 Full backup (M1)

```json
{ "format": "atlas-backup", "formatVersion": 1, "kind": "full-profile",
  "exportedAt": "ISO-8601 UTC", "profile": { } }
```

The file is labelled in the UI as a **full backup that contains everything**, to keep it unmistakably different from a selected-view export.

### 10.2 Import flow

1. Check file size before reading (limit 4 MiB).
2. Parse in isolation. Reject forbidden keys and excessive depth.
3. Validate the envelope, format, versions, schema, limits and integrity.
4. Show a preview: title, counts of categories, items, answers and states, and any warnings.
5. The user confirms. The profile is saved as a **new** profile. If the profile ID collides with an existing one, a new profile ID is assigned; all other IDs are preserved.
6. Any failure leaves existing data untouched and shows a readable, specific message.

### 10.3 Error taxonomy

`file-too-large`, `not-json`, `forbidden-key`, `too-deep`, `wrong-format`, `newer-version`, `unknown-fields`, `schema-invalid`, `integrity-invalid`, `over-limit`. Each has a plain-language message and no technical stack traces.

### 10.4 Later formats

Markdown, SVG and PNG exports (M4) render from the resolved view model, include a legend and the fixed consent statement, and contain only selected fields. PNG is produced from SVG built with plain text elements and system fonts. CSV and PDF follow in M8.

---

## 11. Self-contained URL sharing (M5)

### 11.1 Format

`https://<site>/#atlas=1.<payload>`

The prefix `1` is the single format version. The payload is a share-envelope object, serialised to UTF-8 JSON, compressed with DEFLATE and encoded as base64url without padding.

### 11.2 Envelope

```json
{ "format": "atlas-share", "title": "A quick guide for friends",
  "createdAt": "ISO-8601 UTC", "includesNotes": false,
  "states": [], "groups": [], "items": [], "statement": "..." }
```

It has its own schema and does not reuse the internal profile schema. It contains only resolved, selected data: no audiences, rules, hidden items, unselected categories or other audiences' overrides. The fixed non-consent statement is always present.

### 11.3 Pipeline

Select a view, resolve the audience, apply the inclusion rule (section 5.6), build the envelope, validate, serialise, compress, encode, prefix, measure, show the export review, then copy or generate a QR code.

### 11.4 Decoding

Enforce encoded and decompressed byte budgets using streaming inflate that aborts when the budget is exceeded. Reject malformed encodings. Validate structure, depth, counts and text lengths. Use null-prototype structures and reject forbidden keys. Render all text as text. Never evaluate content. Open as a read-only preview. "Save a copy" creates a new profile after explicit confirmation, and nothing is merged or overwritten automatically.

### 11.5 Size guidance

Under 2 KB is the target. 2 to 8 KB is reasonable. 8 to 32 KB shows a warning. 32 to 100 KB is a strong warning with a file-export offer. Over 100 KB defaults the UI to file export. The full URL is measured, not just the payload. QR codes hold roughly 3 KB at best, so QR output is offered only for very small exports.

### 11.6 Privacy copy (fixed)

"Anyone who has this link can read everything in it. It is not encrypted. Browser history, messaging apps, screenshots and synced devices may keep copies. Only include what you are comfortable sharing."

---

## 12. Templates and modules

### 12.1 Principles

Templates accelerate setup without imposing a worldview. They are versioned data files, bundled with the app (no network fetch). Creating from a template makes an editable copy. Items keep an `origin` so a template can be reset or updated without losing answers. Applying a template never overwrites existing answers without confirmation. Sample data is clearly marked.

### 12.2 Catalogue

| # | Template | Default sensitivity | Default visibility | Milestone |
|---|---|---|---|---|
| 1 | Starter checklist (sample items) | normal / personal | visible | M1 |
| 2 | Names, pronouns, forms of address | personal | visible | M3 |
| 3 | Gendered language and compliments | sensitive | visible | M3 |
| 4 | Physical contact (including friendly and platonic contact, hugs, hand-holding, cuddling, leaning, head on shoulder) | personal | visible | M3 |
| 5 | Personal space and proximity | personal | visible | M3 |
| 6 | Communication preferences | normal | visible | M3 |
| 7 | Emotional support and boundaries | sensitive | visible | M3 |
| 8 | Sensory profile | personal | visible | M3 |
| 9 | Accessibility needs and accommodations | sensitive | visible | M3 |
| 10 | Privacy and digital boundaries | sensitive | visible | M3 |
| 11 | School and work interaction | normal | visible | M3 |
| 12 | Everyday preferences and practical care | normal | visible | M3 |
| 13 | Conflict and repair | personal | visible | M3 |
| 14 | Relationship and affection preferences | restricted | hidden | M3 |
| 15 | Intimacy boundaries | restricted | hidden | M3 |
| 16 | Attraction (per-dimension states and text) | restricted | hidden | M3 |
| 17 | Anatomy and compatibility (descriptive; separate from gender) | restricted | hidden | M3 |
| 18 | Gender identity and expression (states and text) | restricted | hidden | M3 |
| 19 | Body comfort and presentation | sensitive | hidden | M3 |
| 20 | Personal instruction sheet | personal | visible | M3 |
| 21 | Overwhelm or support plan | sensitive | visible | M3 |
| 22 | Emergency information card | restricted | hidden | M3 |
| 23 | Body-region contact map | restricted | hidden | M7 |
| 24 | Attraction map and gender-expression map (multidimensional) | restricted | hidden | M7 |

### 12.3 Content rules

- Plain, neutral, non-clinical wording. No diagnoses, no suggested labels, no judgemental framing.
- Platonic contact between friends is first-class content, not an edge case.
- Intimacy and attraction templates describe boundaries and preferences only; they contain no explicit sexual content.
- Every template carries the statement that preferences are not ongoing consent.
- Pronoun sets are modelled in M3 as grouped state and text items (subject, object, possessive determiner, possessive pronoun, reflexive, plus notes). A dedicated structured item type is considered in M8 (open question O-006).
- Restricted modules are enabled through an explicit action with the adult-intended note (D-009). They can be hidden again at any time.

---

## 13. Visualisations

- **First release:** matrix and checklist (semantic table), compact cards, plain accessible list. Search and category filtering, responsive layout, print styles.
- **Later, one at a time (M7):** body map, multidimensional maps, timeline and snapshots, decision tree, comparison view, relationship graph, overlapping regions, radial diagram.
- Every visualisation needs a data contract, an editor interaction contract, keyboard and touch alternatives, a text alternative, empty and invalid states, export behaviour, and tests. Geometry lives in versioned templates; the profile stores semantic region IDs, never pixel coordinates.
- Visualisation settings are stored separately from profile data. Changing a visualisation never rewrites answers.

---

## 14. Privacy and security

### 14.1 Threats and mitigations

| Threat | Mitigation | Verification |
|---|---|---|
| Accidental sharing of the full profile | Selective export, allowlist views, review screen, labelled full-backup type | Export-selection tests |
| Forwarded or retained share URL | Plain warnings, no encryption claims, file alternative | Copy review |
| Malicious import or URL | Size, depth, count and length limits, strict schemas, forbidden-key rejection, streaming inflate budget | Hostile-input tests |
| Script injection via user text | React text rendering only; no `dangerouslySetInnerHTML` | Lint rule, test |
| Third-party scripts reading the fragment | No third-party scripts; CSP `script-src 'self'`; self-hosted assets | Build inspection |
| Exfiltration by a compromised dependency | Exact pins, minimal runtime deps, `connect-src 'none'` | `npm ls`, e2e request audit |
| Overwriting data in another tab | Revision check and conflict banner | Repository test |
| Data loss from storage clearing | Clear warnings, one-click backup, restore | Backup round-trip test |
| Logging personal data | `no-console` lint rule; no logging of profile or URLs | Lint, grep |

### 14.2 Fixed UI statements (`src/content/notices.js`)

- **Consent:** "A chart shows general preferences. It is not permission, and it does not replace asking. If someone says no or changes their mind, that comes first."
- **Local storage:** "Your charts are stored in this browser on this device. Clearing browser data, using private browsing, or switching device can remove them. Export a backup regularly. Other people who use this browser profile may be able to read them."
- **No upload:** "Nothing you enter is sent anywhere. The app has no accounts and no analytics."

### 14.3 Sensitive data

All profile content is treated as sensitive. Restricted items never appear in an export unless individually opted in. Notes never appear unless the view allows notes and the note is marked shareable.

---

## 15. Testing and verification

### 15.1 Layers

- **Domain unit tests:** state cycle, validation, commands, selectors, history, immutability.
- **Storage tests (fake IndexedDB):** save, load, delete, revision conflict, backup round trip, hostile imports.
- **Component tests:** matrix interaction, accessible names, picker, notices.
- **End-to-end (Playwright, production build):** create, edit, reload, undo, export, import, keyboard-only, touch viewport, no external requests, CSP present, axe scan.

### 15.2 Commands

```text
npm ci
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
npm ls --omit=dev
grep -rn "console\." src
grep -rniE "sendBeacon|XMLHttpRequest|WebSocket|gtag|analytics" src
```

Hits from the two `grep` checks are reviewed by hand.

### 15.3 Definition of done for a feature

User workflow clear; data contract defined; validation and readable errors; keyboard, touch and screen-reader support; empty, loading and failure states; persistence and import/export behaviour defined; unit, component and end-to-end tests; no network transmission of profile content; decision recorded where non-obvious.

---

## 16. Release gates

| Gate | Reached when |
|---|---|
| Prototype | M1 and M2 complete: local chart editing, configurable palette, JSON backup and restore, keyboard support, no upload |
| Private alpha | M5 complete: templates, audience views, export review, Markdown and SVG, URL sharing end to end, import limits, basic accessibility |
| Public beta | M6 complete: hardened security and accessibility, offline shell, privacy copy reviewed, known limitations documented |
| 1.0 | M7 core visualisations complete, cross-browser and mobile verified, migrations tested, no open critical or high privacy or data-loss issue |

---

## 17. Progress tracker

Legend: `[ ]` not started, `[~]` in progress, `[x]` done and acceptance criteria passed. "Unverified" means built but a required check could not be run in the build environment.

### M1. Core local chart  (status: complete)

Scope: scaffold; domain schema and state engine; starter chart; add, rename and delete categories and items; state editing by pointer, keyboard and picker; notes; undo/redo; IndexedDB autosave; JSON backup export and validated import-as-new-profile; notices; headers and CSP.

Tasks:

- [x] M1-01 Scaffold repo, scripts, lint, test config, `.gitignore`, README
- [x] M1-02 `domain/limits`, `ids`
- [x] M1-03 `domain/schema` (profile, state, category, item, answer, audience, override, view)
- [x] M1-04 `domain/defaults` (default states, starter profile)
- [x] M1-05 `domain/state-cycle`
- [x] M1-06 `domain/validation` (limits, forbidden keys, schema, integrity)
- [x] M1-07 `domain/selectors`, `commands`, `history`
- [x] M1-08 `storage/database`, `profile-repository` (revision-checked)
- [x] M1-09 `storage/backup` (export, parse, preview, import as new)
- [x] M1-10 UI shell, tokens, accessibility CSS
- [x] M1-11 Matrix view, state cell, badge, picker, notes
- [x] M1-12 Session hook: autosave, save status, undo/redo, multi-tab conflict (tests cover "Saved" only after commit, failed save and retry, conflict banner, paused editing, reload, deletion elsewhere)
- [x] M1-13 Import/export UI, profile switcher, delete actions
- [x] M1-14 Notices (consent, local storage, no upload); wording pinned to the spec by tests
- [x] M1-15 `vercel.json`, CSP injector, CI workflow
- [x] M1-16 Unit, storage and component tests
- [x] M1-17 Playwright specs written
- [x] M1-18 Playwright specs executed (ran in the build sandbox with Chromium: 28 passed, 6 skipped by design)
- [x] M1-19 Docs: DATA_MODEL, SECURITY_AND_PRIVACY, decision records (0002 to 0004)

Acceptance criteria:

| ID | Criterion |
|---|---|
| M1-AC-01 | Clean clone passes `npm ci`, `npm run lint`, `npm test`, `npm run build` |
| M1-AC-02 | `getNextState` is pure and tested: default order, clamp at both ends, loop, off-cycle returns Unanswered, custom order, invalid configuration returns an error |
| M1-AC-03 | No path (load, import, migration, default) turns a missing answer into a positive-semantic state |
| M1-AC-04 | Primary click, secondary click, Enter, Space, Shift variants and the picker follow the configured cycle; the context menu is suppressed only on state cells; a non-right-click route reaches every state |
| M1-AC-05 | Every cell's accessible name includes the item label and state text; state is distinguishable without colour; axe finds no serious or critical violations |
| M1-AC-06 | Reload restores the profile; "Saved" appears only after commit; a simulated failure shows "Could not save" and keeps data |
| M1-AC-07 | Undo and redo cover state changes and add, rename, delete of items and categories; deleting a category with items and undoing it leaves no dangling references |
| M1-AC-08 | Export then import-as-new gives a deep-equal profile (IDs, states, notes, order); the existing profile is untouched |
| M1-AC-09 | Hostile imports are rejected with a readable message and existing data stays byte-identical: malformed JSON, oversized file, wrong format, newer version, unknown fields, dangling references, duplicate IDs, category cycles, forbidden keys, excess depth, over-limit counts |
| M1-AC-10 | Zero requests to other origins during e2e; production HTML has CSP with `connect-src 'none'`; `vercel.json` carries headers; runtime dependencies are exactly react, react-dom, zod, idb |
| M1-AC-11 | Consent, local-storage and no-upload notices are visible in the app |
| M1-AC-12 | Schema carries sensitivity levels, category visibility and template-origin fields; effective sensitivity is the higher of item and category |
| M1-AC-13 | A stale save is rejected with `ConflictError`; the UI shows the conflict banner and does not overwrite |

### M2. Palette editor, search, reordering  (status: in progress, batch 4 of 5 delivered)

Delivery plan: five small batches of two steps. Batch 1 (M2-01, M2-02) palette commands and editor. Batch 2 (M2-03, M2-04) contrast warnings and high-contrast theme. Batch 3 (M2-05, M2-06) search, category filter, reordering. Batch 4 (M2-07, M2-08) bulk actions and profile management. Batch 5 (M2-09, M2-10) settings UI, end-to-end run, docs and acceptance pass.

- [x] M2-01 Palette commands: rename, recolour, icon, pattern, meaning; add state; cycle membership and order; remove with reassign-or-clear (`domain/palette-commands.js`, D-026, D-027)
- [x] M2-02 Palette editor UI: cycle list with move earlier/later, menu-only list, per-state editor with live preview, add state, remove dialog (`features/palette/`)
- [x] M2-03 Contrast-ratio warnings for custom colours (`domain/contrast.js`, `ContrastNote`, flag in the palette list; advice only, D-028)
- [x] M2-04 High-contrast theme (manual switch): Appearance menu with device, light, dark, high contrast; device preference outside the profile (D-029)
- [x] M2-05 Search and category filter (`domain/search.js`, `SearchBar`, filtering in `MatrixView`; D-030)
- [x] M2-06 Reorder items and categories: Up and Down buttons, keyboard, focus kept, announced, undoable (`domain/order-commands.js`; D-031; drag not built)
- [x] M2-07 Bulk select and bulk state, note and category change with confirmation (`domain/bulk-commands.js`, `BulkBar`, checkboxes on rows; D-032)
- [x] M2-08 Profile management: rename, duplicate, storage usage display (`domain/profile-commands.js`, `ProfilesPanel`, `StorageUsage`; D-033)
- [ ] M2-09 Settings UI for end behaviour (clamp or loop) and click direction
- [ ] M2-10 M2 end-to-end run, docs, acceptance pass
- Exit: prototype gate

Batch 1 verification (this build environment): `npm run verify` passes (lint, source scan, 252 unit and component tests, build, build check). The new Playwright spec `tests/e2e/palette.spec.js` is written but **unverified**: Chromium could not be installed in this environment (no network route to the browser download). Run `npx playwright install chromium && npm run test:e2e` locally.

Batch 3 verification (this build environment): `npm run verify` passes (lint, source scan, 372 unit and component tests, build, build check). New tests: `tests/domain/search.test.js`, `tests/domain/order-commands.test.js`, `tests/components/search.test.jsx`, `tests/components/reorder.test.jsx`. The Playwright spec `tests/e2e/search-order.spec.js` is written but **unverified**: Chromium still cannot be installed here. Run `npx playwright install chromium && npm run test:e2e` locally; this also covers the earlier unverified `palette.spec.js` and `theme.spec.js`.

Batch 4 verification (this build environment): `npm run verify` passes (lint, source scan, unit and component tests, build, build check). New tests: `tests/domain/bulk-commands.test.js`, `profile-commands.test.js`, `format-bytes.test.js`, `tests/components/bulk.test.jsx`, `profile-management.test.jsx`. The Playwright spec `tests/e2e/bulk-profile.spec.js` is written but **unverified**: Chromium still cannot be installed here.

### M3. Templates and modules  (not started)

- [ ] Template data format, loader, versioning, origin metadata
- [ ] Templates 2 to 22 from section 12.2, wording reviewed by the user
- [ ] Module enable and hide flow; adult-intended note for restricted modules
- [ ] Create-from-template, reset-to-template, update-from-newer-version without losing answers
- [ ] Template schema tests (I-10 separation of attraction, anatomy, gender)

### M4. Audiences, views, exports  (not started)

- [ ] Audiences, direct overrides, effective-state explanation, conflict reporting
- [ ] Views (allowlist), inclusion rule, export review screen
- [ ] Markdown, SVG, PNG exports with legend and consent statement
- [ ] Comparison of default against one audience; print styles
- [ ] Export-selection tests proving restricted items and notes never leak

### M5. Self-contained URL sharing  (not started)

- [ ] Share schema, codec with streaming inflate budget, fragment reader
- [ ] Read-only preview, Save a copy, size meter and warnings
- [ ] Local QR for small exports; file fallback
- [ ] Hostile payload tests; clean-context e2e; private alpha gate

### M6. Hardening and offline  (not started)

- [ ] Security, accessibility, storage-failure and migration reviews
- [ ] Cross-browser and mobile checks
- [ ] Service worker app shell only after update and migration behaviour is tested
- [ ] Privacy copy review; public beta gate

### M7. Rich visualisations  (not started)

Order: body map, multidimensional maps, timeline and snapshots, decision tree, comparison view, relationship graph, overlapping regions and radial diagrams. Each is its own mini-milestone with the section 13 requirements.

### M8. Advanced modules  (not started)

Further item types (multi-select, number, date, reference, structured pronoun sets), conditional rules and audience inheritance per spec §6.4, CSV and PDF, standalone HTML, password-protected export, community templates with an abuse and privacy review. Encrypted sync only after a separate threat model.

---

## 18. Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R-01 | Scope explosion from the taxonomy | High | High | Generic engine first; templates are data | Open |
| R-02 | Silent permission via missing data | Medium | Critical | I-01 tests at every boundary | Mitigated by design |
| R-03 | Decompression bomb or oversized payload | Medium | High | Streaming inflate with byte budget (M5) | Planned |
| R-04 | Two tabs overwrite each other | Medium | High | Revision check, conflict banner | M1 |
| R-05 | Restricted data leaks into an export | Low | Critical | Allowlist views, per-item opt-in, notes off by default | M4 |
| R-06 | Template wording is unsuitable or presumptuous | Medium | Medium | User review, neutral style rules | M3 |
| R-07 | Browser storage is cleared | High | High | Warnings, easy backup | M1 |
| R-08 | Right-click unavailable (touch, trackpad, assistive tech) | High | Medium | Picker, keyboard alternatives | M1 |
| R-09 | Colour misread by recipients | Medium | Medium | Text labels, icons, legend in every export | M1, M4 |
| R-10 | Dependency compromise | Low | High | Exact pins, few dependencies, CSP, lockfile review | Ongoing |
| R-11 | Share URL truncated by messaging apps | High | Medium | Size warnings, file alternative | M5 |
| R-12 | Misreading a chart as lasting consent | Medium | High | Fixed statement in UI and every export | M1, M4 |
| R-13 | Playwright cannot run in the build sandbox | High | Low | Specs delivered; run locally | M1 |

---

## 19. Open questions

| ID | Question | Needed by | Default if unanswered |
|---|---|---|---|
| O-001 | Final public name | Public beta | Keep working title |
| O-002 | Production domain (affects share-URL base) | M5 | Vercel-provided domain |
| O-003 | Maximum decompressed share size: confirm 2 MiB | M5 | 2 MiB |
| O-004 | How much rich text in notes? | M2 | Plain text only |
| O-005 | Template update behaviour when a user has edited an item | M3 | Keep user edits, offer to review |
| O-006 | Structured pronoun-set item type, or grouped items | M8 | Grouped items |
| O-007 | PDF approach that stays fully local | M8 | Print stylesheet |
| O-008 | Glossary of terminology: include or not, and who maintains it | M8 | Not included |
| O-009 | Final precedence rules for overlapping audience and contextual rules | M8 | Direct overrides only |
| O-010 | Whether the adult-intended note should require a deliberate acknowledgement | M3 | Informational note |

---

## 20. Change log

| Date | Version | Change |
|---|---|---|
| 2026-10-25 | 0.1.0 | Initial specification and implementation plan |
| 2026-10-26 | 0.2.0 | Unified specification and tracker. Resolved decisions D-001 to D-025, including cycle semantics, hosting, restricted-module scope, answers separated from definitions, sensitivity levels, view allowlist |
| 2026-10-26 | 0.3.0 | M1 complete. Tracker ticked, acceptance criteria verified, docs added |
| 2026-10-26 | 0.4.0 | M2 batch 1: palette commands and editor. Decisions D-026, D-027 added |
| 2026-10-26 | 0.5.0 | M2 batch 2: contrast warnings and high-contrast theme. Decisions D-028, D-029 added |
| 2026-10-26 | 0.6.0 | M2 batch 3: search, category filter and reordering. Decisions D-030, D-031 added |
| 2026-10-26 | 0.7.0 | M2 batch 4: bulk actions and profile management. Decisions D-032, D-033 added |

### Progress journal

| Date | Entry |
|---|---|
| 2026-10-26 | Document issued. M1 started. |
| 2026-10-26 | M1-01 to M1-06 done: scaffold, limits, ids, schema, defaults, state cycle, validation. 41 domain tests pass; `npm run verify` passes; `npm audit` reports 0 vulnerabilities. Covers M1-AC-02 and the domain-level parts of M1-AC-03 and M1-AC-09 (storage-level checks still to come). M1-16 in progress. Next: M1-07 selectors, commands, history. |
| 2026-10-26 | M1-07 done: selectors, commands (state step/set, notes, category and item add/rename/delete with cascade), in-memory history with note grouping and 100-entry cap. 68 domain tests pass; `npm run verify` passes. Covers the domain side of M1-AC-03, AC-04 (cycle and picker routes) and AC-07 (undo of state changes and add/rename/delete; category delete then undo leaves no dangling references). Design note: undo/redo and `syncRevision` keep the live `revision`, so a save after undo never raises ConflictError. UI side of AC-04 and AC-07 still to come. Next: M1-08 storage (database, revision-checked repository). |
| 2026-10-26 | M1-08 done: `storage/database` (atlas-db v1, profiles + settings stores, persistence and usage helpers) and `storage/profile-repository` (create, revision-checked save, load, list, delete, delete-all, active profile). 86 tests pass with `fake-indexeddb`; `npm run verify` passes. Storage-level coverage for M1-AC-06 (a failed write rejects and leaves data unchanged; a save resolves only after commit; reload restores) and M1-AC-13 (stale save raises `ConflictError`, including two simultaneous saves and a profile deleted in another tab). Also: invalid stored records are reported with their raw data and never overwritten; a record from a newer schema version is never overwritten. UI parts of AC-06 and AC-13 (status text, conflict banner) still to come. Next: M1-09 backup export/import. |
| 2026-10-26 | M1-12 and M1-13 done. M1-12: `tests/components/session.test.jsx` (8 tests) proves the status stays on Saving… until the transaction commits, a failed save shows Could not save and keeps data on screen with nothing stored, Try saving again works, a stale save shows the conflict banner without overwriting the other tab, editing pauses after a conflict, Reload latest version recovers, and a profile deleted elsewhere is a conflict not a re-create. M1-13: `features/import-export/BackupPanel` (full backup download with the "contains everything, not encrypted" notice; import with size check before reading, validation, preview, confirm, new profile only) and `features/settings/ProfilesPanel` (switch, create, delete profile and delete all local data, each destructive action behind a confirmation that says what it removes); an unreadable stored record now offers a raw-record download and the same panels. 24 tests in `tests/components/profiles-backup.test.jsx` cover AC-08 round trip and the AC-09 hostile-file list at the UI (malformed JSON, wrong format, newer version, unknown fields, dangling reference, duplicate ids, category cycle, forbidden key, excess depth, oversized file read-refused, over-limit count), each leaving raw storage byte-identical. 189 tests pass; `npm run verify` passes. Next: M1-14 notices review and M1-15 `vercel.json`, CSP injector, CI workflow. |
| 2026-10-26 | M1-14 and M1-15 done. M1-14: the three fixed notices were already on screen; `tests/components/notices.test.jsx` now pins their exact wording to spec 14.2 and checks consent appears before the chart. M1-15: `config/security.js` is the single source for the CSP and other headers; `vercel.json` is generated from it and a test fails if they drift. A Vite plugin (build only) inserts the CSP meta tag first in `<head>` (without `frame-ancestors`, which browsers ignore in meta; it is in the header). New scripts: `check:source` (spec 15.2 greps as failures: console, network APIs, fetch, analytics, innerHTML/eval) and `check:dist` (CSP meta with `connect-src 'none'`, no inline scripts or handlers, no other origins in HTML or CSS). `verify` now also runs both. CI runs verify, `npm audit --omit=dev`, and asserts runtime deps are exactly idb, react, react-dom, zod. Note: React sets the badge colours through the CSSOM, which `style-src 'self'` allows, so no `unsafe-inline` is needed. 200 tests pass. Remaining for M1: M1-16 (finish tests), M1-17 and M1-18 Playwright specs, M1-19 docs. |
| 2026-10-26 | M1-16, M1-17 and M1-18 done. M1-16: added `tests/storage/missing-answers.test.js` (AC-03: a missing answer is Unanswered by default, after store and load, after backup round trip, with partial answers, and a dangling state resolves to Unanswered; a stored answer naming Unanswered is rejected). M1-17/18: `@playwright/test` and `@axe-core/playwright` added as exact-pinned dev dependencies; `playwright.config.js` builds and serves the production build and runs a desktop and a phone (Pixel 5, touch) project. Specs in `tests/e2e/`: chart (edit, reload, undo/redo, add category, right click, picker, delete-all dialog), keyboard (Enter/Space/Shift variants, undo shortcuts, visible focus, dialog focus trap), touch (tap, no horizontal scroll, 44px targets), backup (download then import as new, bad file refused), security (CSP meta, browser blocks a cross-origin fetch, zero other-origin requests in every test via the shared fixture, axe in light and dark with real colour contrast, no console output). They ran against Chromium here: 28 passed, 6 skipped by design (right click and keyboard flows skip on the touch project, touch flows skip on desktop). Real bug found and fixed by the touch spec: at phone width the page scrolled sideways by 33px because grid children could not shrink; fixed in `base.css`. Also corrected my own spec: undo history is in memory only (D-025), so Undo is disabled after a reload, and the test now asserts that. CI now installs Chromium and runs `test:e2e`. Remaining for M1: M1-19 docs (DATA_MODEL, SECURITY_AND_PRIVACY, decision records), then a final pass over M1-AC-01 to AC-13. |
| 2026-10-26 | M1-19 done and M1 complete. Added `docs/DATA_MODEL.md`, `docs/SECURITY_AND_PRIVACY.md`, decision records 0002 (security headers single source), 0003 (undo keeps live revision), 0004 (hand-built confirm dialog), and README links. Final acceptance pass on a clean copy (no node_modules, no dist): `npm ci`, lint, 206 tests, build and build check all pass; `npm audit --omit=dev` reports 0 vulnerabilities; runtime dependencies are exactly idb, react, react-dom, zod; e2e 28 passed, 6 skipped by design. Criteria map: AC-01 clean-copy run above. AC-02 `state-cycle.test.js`. AC-03 `missing-answers.test.js`, `commands.test.js`. AC-04 `matrix.test.jsx`, e2e chart and keyboard. AC-05 `matrix.test.jsx` (axe), e2e security (axe with contrast, light and dark). AC-06 `profile-repository.test.js`, `session.test.jsx`. AC-07 `commands.test.js`, `matrix.test.jsx`. AC-08 `backup.test.js`, `profiles-backup.test.jsx`, e2e backup. AC-09 `validation.test.js`, `backup.test.js`, `profiles-backup.test.jsx`. AC-10 `security.test.js`, `check-dist`, e2e security, CI dependency check. AC-11 `notices.test.jsx`. AC-12 `commands.test.js`, `backup.test.js`. AC-13 `profile-repository.test.js`, `session.test.jsx`. Not covered by M1 and left for M6: Firefox, Safari and iOS Safari runs (only Chromium and Chromium touch emulation were run), screen-reader testing by hand. Next: M2 (palette editor, search, reordering, settings UI). |
| 2026-10-26 | M2 batch 1 (M2-01, M2-02) done. New `domain/palette-commands.js`: `updateState`, `addState`, `setStateInCycle`, `moveStateInCycle`, `removeState`, `removalReplacements`, plus `selectors.stateUsage`. New UI `features/palette/` (PalettePanel, StateEditor, ColourField, RemoveStateDialog) and `styles/palette.css`, wired into the App below the chart and closed by default. `ConfirmDialog` now takes extra controls and traps focus across all of them (decision 0004 revisited, still hand-built). Safety rule D-026: removing a state can only move answers to a state that is no more permissive, otherwise they are cleared. A real accessibility bug was caught by the new tests: a hidden-text span with a leading space produced the button name "Save changesto Yes"; fixed by putting the space outside the span. 252 tests pass (46 new). Playwright spec written, not run here. Next: M2-03 contrast warnings, M2-04 high-contrast theme. |
| 2026-10-26 | M2 batch 2 (M2-03, M2-04) done. M2-03: `domain/contrast.js` (ratio, rating, plain-language warning), `ContrastNote` in the state editor (not a live region, linked to both colour fields with aria-describedby), and a "Low contrast" or "Weak contrast" flag in palette rows. Advice only (D-028). M2-04: Appearance menu (`features/settings/ThemeSwitch`, `use-theme`), `storage/preferences.js` keeps the choice in the settings store with a fixed allowlist, tokens for light, dark and high contrast (dark values duplicated for device and explicit choice, a test keeps them identical), and high-contrast badges ignore custom colours (D-029). A failed theme save is shown (I-13). Tests added: contrast (22), themes and token contrast (10), preferences (9), contrast UI (9), theme UI (11). 313 tests pass; `npm run verify` passes. Playwright spec `tests/e2e/theme.spec.js` is written but **unverified**: Chromium cannot be downloaded in this environment. Known limitation: a non-system theme can flash briefly on load. Next: M2-05 search and category filter, M2-06 reordering. |
| 2026-10-26 | M2 batch 3 (M2-05, M2-06) done. M2-05: `domain/search.js` (`filterTree`, `categoryChoices`, accent- and case-insensitive all-words match over label, description, tags and category names; notes are not searched, D-030), `features/editor/SearchBar.jsx` (search box, category menu, Clear filters, result count in a polite status), wired into `MatrixView`. While a filter is on, move buttons are hidden, and add-item forms are hidden while a search is typed. A filter for a deleted or hidden category is ignored. M2-06: `domain/order-commands.js` (`moveItem`, `moveCategory`; renumbers siblings, steps over hidden categories, reports position for the announcement), Up and Down buttons on item rows and category headers with names such as "Move item A high five up", disabled at the ends, focus put back on the pressed button (or its opposite at an end) because re-ordering the DOM can drop focus. Fixed along the way: search inputs were missing from the shared field styling, so they would have used browser colours in dark and high contrast themes. 372 tests pass (59 new); `npm run verify` passes. Playwright spec `tests/e2e/search-order.spec.js` written but **unverified** (no Chromium here). Next: M2-07 bulk select and bulk change, M2-08 profile management. |
| 2026-10-26 | M2 batch 4 (M2-07, M2-08) done. M2-07: `domain/bulk-commands.js` (`setItemsState`, `setItemsNote`, `moveItemsToCategory`), built from the single-item commands so every single-item rule still applies; text items are skipped and counted; moving never lowers sensitivity and refuses hidden categories (D-032). UI: a "Select items" toggle, a checkbox on each row, and `BulkBar` with Select all shown, Clear selection, Set state, Move and Change notes. Each action opens a confirmation stating how many items change, how many are already as asked and how many are skipped; nothing opens when nothing would change. Only selected items that are also shown are changed, and the bar says how many selected items a filter is hiding. One undo step per action. M2-08: `domain/profile-commands.js` (`renameProfile`, `duplicateProfile`), rename form and "Make a copy of this profile" in the Profiles panel (the copy is a new profile and the original is untouched, D-033), `StorageUsage` showing the profile size and the browser estimate with a plain fallback. The first run of the new component tests had four failures, all mistakes in the tests themselves (wrong expected counts, a focus order, a click direction); no app bug turned up. Playwright spec `tests/e2e/bulk-profile.spec.js` written but **unverified** (no Chromium here). Next: M2-09 settings UI for end behaviour and click direction, M2-10 end-to-end run, docs and acceptance pass. |
