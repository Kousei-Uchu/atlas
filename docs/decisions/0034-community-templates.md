# 0034 Community templates with an abuse and privacy review (D-074, M8-07)

## Decision
A person can open a template file someone else wrote (Modules, "Add a template from a file"). There is no catalogue, no upload, no fetch and no account: a file travels however people already share files, and the app only reads what the person chooses to open. This keeps the app local-first (nothing is hosted, so there is nothing to moderate centrally, and no one learns who uses which template).

Flow: size limit (256 KiB) -> safe JSON parse (reserved keys, depth) -> the same strict template schema and rules as bundled templates -> text rules -> full preview with a "read every item" tick -> add.

## Threat review
| Abuse | Defence |
|---|---|
| Contact harvesting, phishing, tracking links | Any web address, email, phone number or @handle in any string refuses the whole file. The message names where, never repeats the text. |
| Spoofing with invisible or direction-changing characters | Control, zero-width, direction override/isolate, tag and variation characters refuse the file. |
| Markup or link syntax reaching HTML or Markdown exports | `<`, `>` and `](` refuse the file (exports also escape; this is a second layer). |
| Carrying someone's answers or notes in | Strict schema: unknown fields (answers, notes) refuse the file. A template can only hold definitions (D-011). |
| Hijacking a bundled module by reusing its id so updates or resets rewrite it | An imported file's id is replaced by a fresh one, never stored, and every imported category and item has `origin: null`, so update and reset cannot reach it. Bundled ids are never touched. |
| Under-labelled intimate content leaking into shared views | Imported categories start hidden, and sensitivity is never lower than personal (sensitive when the file says adult-intended). Existing hold-backs for sensitive and restricted items then apply to views and exports. The person can raise or lower it afterwards. |
| Pressure wording, false "consent" claims | Not detectable by text rules without judging meaning, which I-10 forbids. Defence is human review: the whole file is shown, the consent statement is in the notice, and nothing is added until the person ticks that they have read it. |
| Oversized or hostile files | 256 KiB limit before reading, template limits (30 categories, 300 items), profile limits at add. |
| Silently dropping or repairing | Never: a file is accepted whole or refused with reasons (I-14 spirit). |

## Residual risks (stated, not solved)
- Wording is not checked for meaning. A file can still be rude, leading or poor. Review is the person's.
- The web-address rule matches a list of common endings, so an unusual ending is not caught; markup, schemes and `www.` are.
- A very rare legitimate item (for example a hotline number) is refused. Authors can leave it out; people can add it themselves.
- No signing: the app cannot say who wrote a file.

## Not built
Exporting your own categories as a template file (it needs its own leak review: labels can be personal), and any hosted catalogue or rating. Both need a separate decision and, for a catalogue, a moderation and privacy plan.

## Authoring format
Same as `src/content/templates/README.md`, as a `.json` file with the same fields. `isSample` should be false and `statement` must be `preferences-not-consent`.

## Tests
`tests/domain/community-template.test.js` (including that no bundled template trips the rules), `tests/e2e/community-template.spec.js`.
