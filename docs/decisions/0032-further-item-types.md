# 0032. Number, date and choice items

Date: 2026-11-12. Status: proposed (the owner may veto). Records D-072. Part of M8 (M8-05). Closes O-006 as "keep grouped items".

## What is added

Three item types beside state and text, for custom items a person adds to any group ("Add a number, date or choice item to <group>", inside a disclosure so the ordinary one-field add is unchanged):

- **Number.** An optional unit (up to 20 characters). Digits with an optional minus sign and up to 6 decimals, no larger than a million million. Stored in the answer's `text` in one written form (no plus sign, no leading or trailing zeros, "-0" is "0"), so "7.50" is kept and shown as 7.5. Checked when the box is left or Enter is pressed, so half-typed text is never an error.
- **Date.** A real calendar date as year-month-day, stored in `text`. Uses the browser's date field, which also takes typing. A "Clear date" button empties it.
- **Choice.** A list of the person's own options (1 to 12, each up to 40 characters, no two the same ignoring case) with several allowed at once. The answer is `choices`, the ids of the chosen options. Shown as the option labels in the item's order, not the order they were ticked, which carries no meaning. Options are edited as one per line; an option whose label is unchanged keeps its id and its answer.

An empty one is Unanswered and is not stored (I-01), as for a state or text. None of them is a state: no colour, no score, no total, no audience override (I-10). A note can sit beside any of them.

## Why the answers are stored as text

A number or a date lives in `text`, and a choice is turned into its labels by one function (`valueText`). The view builder, export model, Markdown, CSV, web page, PDF, picture, share link and the decision tree therefore carry these as plain words with no new code, and every leak guarantee already tested for text items (sensitivity, restricted groups, hidden groups, notes) applies unchanged. Cost: a number is not a number inside an export, which is right for a document meant to be read, and a recipient cannot sort by it.

## Schema version 3

Item gains optional `options` and `unit`; the answer gains optional `choices`. Version 2 profiles are valid version 3 profiles and migrate on a copy by changing only the version (`MIGRATIONS[2]`, read never writes). The version is bumped even though nothing is rewritten, so that an older app refuses a file that may now hold these types with the usual "newer version" message instead of failing on unknown fields (I-14).

## Integrity (validation)

An answer must match its item: number and date text must already be in the kept form, a choice answer may only name existing options and none twice, no choice answer on another type, no state on a non-state item, no text on a choice item. A choice item needs at least one option, with no repeated id or name. Options exist only on choice items and a unit only on number items. Tests check every refusal.

## Not changed on purpose

State-only features stay state-only: audience overrides, bulk state, snapshots and the timeline, comparison, the dimension and body maps, the radial diagram and overlaps. They do not read these items, so a person's numbers and dates never appear in pictures or counts of "answers". Templates still define state and text items only; there is no new template format.

## Not done

- **Structured pronoun sets (O-006): kept as grouped items.** The grouped state and text items already express a pronoun set, each part can have its own audience and sensitivity, and a dedicated type would add a fixed idea of how pronouns work (which sets exist, how many parts, which are "mine") that the grouped form leaves to the person.
- **Reference items (a link from one item to another):** left out. They add integrity cases (a missing target, a loop, a target in a view that holds it back) with a real leak risk, and nothing asked for them. If they are wanted, they need their own threat note first.

## Tests

Unit: canonical number and date forms and every refusal; setting and clearing each type; wrong type of item; unknown options; same value is no change; a note kept when a value is cleared; `addItem` rules; keeping answers when options change; no override on the new types; words for a value; the model, Markdown, CSV and web page carry them and still hold back a restricted one; validation refusals; backup round trip; migration 2 to 3. E2E (desktop and phone): add each type, answer, a refused number, edit options, reload and find them again; a choice item needs an option; a date can be cleared; axe in three themes and 320 px.
