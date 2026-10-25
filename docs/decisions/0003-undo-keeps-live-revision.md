# 0003. Undo and redo never roll back `revision`

Date: 2026-10-26. Status: accepted.

`revision` is a storage concurrency counter, not user content. If undo restored an older snapshot including its revision, the next autosave would look stale and raise `ConflictError` against our own earlier save. History therefore carries the live revision forward on every undo and redo, and `syncRevision` updates it after each save. Real conflicts from another tab are still detected, because the stored revision then differs from the one this tab last saw.

Undo history is in memory only (D-025), capped at 100 entries, and is gone after a reload. The e2e suite asserts Undo is disabled after a reload.
