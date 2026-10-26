# 0012. Updating and resetting a module keep answers, match by key, and show what changes first

Date: 2026-10-26. Status: proposed (the user may veto). Records D-037, D-038 and D-039.

**Matching.** An entry made from a template carries `origin.key`. Update and reset find it again by that key, so a person can rename an item and it is still the same item. Wording is never used to match.

**No old copies.** The app does not keep earlier versions of a template, so it cannot tell "the person deleted this" from "this is new". It therefore treats anything not in the profile under its key as missing, and the confirmation lists what will be added before anything happens. A person who deleted an item on purpose sees it listed and can cancel, or delete it again after.

**Update is gentle, reset is thorough.** Update only adds, and only when the template is newer than the version the module records. It does not change wording, so edits survive (this resolves O-005). Reset also restores the template's wording and order, after saying how many entries differ.

**What never changes.** Answers and notes, because they hang off item ids and both commands keep every id (I-01, D-011). An item's type, so an answer never stops fitting its item. A sensitivity level: it can be raised by the template and is never lowered (D-032). Visibility of existing categories. Anything the person added, and anything the template no longer has.

**New categories.** They follow the module: shown while it is on, hidden while it is hidden. An adult-intended module whose note was not acknowledged never gains a visible category, so these commands cannot be used to get round D-009.

**A newer profile.** If the profile records a newer template version than the app knows, both commands refuse and the panel says why. Nothing is ever downgraded.

**Restricted and adult-intended.** The earlier rule that restricted content must be adult-intended (D-035) was too blunt for the emergency card, whose subject is contact and health details. A restricted template must be hidden by default; the adult-intended flag, which brings the adult note, is for relationship and body modules (D-037).

**New profile from modules.** The new profile is built by the same `addModule` command, one module after another, on a profile with the default states and nothing else. It is always a separate profile (I-12), and it starts with no sample items and no answers.
