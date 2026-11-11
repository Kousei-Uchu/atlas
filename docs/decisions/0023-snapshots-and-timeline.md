# 0023. Snapshots and the timeline, and the first schema migration

Date: 2026-11-10. Status: proposed (the owner may veto). Records D-063.

**What a snapshot is.** The answers to the state questions at one moment, with a name the person chose and the time it was saved. Each entry holds the item, its group name and the state, by id and by name, so history stays readable after things are renamed or deleted.

**What a snapshot never holds.** Notes, the person's own words, audiences, overrides and views. Notes are the most sensitive thing in a profile and the thing a person is most likely to delete, so history does not keep a second copy of them. An answer that is Unanswered is not stored, because Unanswered is the absence of an answer (I-01).

**Where it lives: inside the profile.** The alternative was a separate store. Inside the profile means backup, import, duplicate, undo and "delete all local data" cover it with no new code, and a profile cannot be backed up without its history by accident. The cost is a profile that is a little larger. Limits keep that bounded: 20 snapshots, and 10,000 saved answers in total, so a profile always fits in a backup file (4 MB).

**Schema version 2, and the first real migration.** `snapshots` is a new required field, so the schema is now at version 2. `MIGRATIONS[1]` adds `snapshots: []` and changes nothing else. It runs on a copy, reading never writes, and a failed or missing step leaves the stored record alone (M6-01 harness). An older cached copy of the app sees version 2 data as newer and refuses it, which is the right behaviour (I-14). Tested on the real read, save and backup paths, as well as in the harness.

**Deleting.** Deleting an item does not remove it from earlier snapshots. This is deliberate (history is the point) and the screen says so in plain words, along with "delete the snapshot too". Each snapshot can be deleted, all can be deleted together, both with a confirmation that says backups and files already made keep their own copies. Both can be undone until the page closes. "Delete all local data" removes snapshots with the profiles.

**Sharing.** Snapshots are never in views, exports or share links. The export model reads named fields only, and a leak test puts a canary in a snapshot name and checks the model, Markdown and SVG.

**The timeline.** Snapshots oldest to newest, then "Now". Each point says how many answers changed since the one before. Compare any snapshot with another or with now: changed, answered since, and answer cleared since, with the state names. It never scores: no better, worse, more or less. A test checks the screen text for such words.

**Restoring.** There is no "restore over this chart". "Make a new profile from this snapshot" makes a new profile with the snapshot's answers and the same structure, and opens it. The profile you were in is not changed (I-12). Notes, own words, overrides, views and history are not carried over. Answers whose item or state no longer exists are skipped, and the announcement says how many.

**Not done.** No renaming in the screen yet (the command and its tests exist). No automatic snapshots: a snapshot is always something the person chose to save.

**Copy.** New notice text on the timeline, and the backup notice and data-handling page now say backups include snapshots and that deleting an item does not remove it from a snapshot. The copy-rules test covers it. The wording needs the owner's sign-off like the rest.
