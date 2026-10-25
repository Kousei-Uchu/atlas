# 0008. Bulk changes act on what is shown, and copies are new profiles

Date: 2026-10-26. Status: proposed (the user may veto).

Bulk changes: a selection can outlive a search or category filter, so the bulk bar changes only items that are both selected and currently shown, and says how many selected items are hidden. Without this, narrowing a search after selecting could leave a bulk change reaching rows the person can no longer see. Every action opens a confirmation with the counts (changes, already as asked, skipped), and nothing opens if nothing would change. Each action is one undo step.

Setting many items to a positive or conditional state carries a reminder that a saved answer is a preference, never consent (I-02). It is wording in the confirmation, not a block.

Moving items between categories keeps each item's effective sensitivity at least what it was, by raising the item's own level if the new category is less sensitive (D-015 takes the higher of the two). Otherwise moving an item out of a sensitive category would quietly make it look less sensitive. Hidden categories cannot be a target, because the items would vanish from the editor.

Copies: "Make a copy" saves the open profile first, then stores a new profile with a new profile id, revision 0 and the title "Copy of ...". Ids inside the copy are unchanged, as with import-as-new, because they only need to be unique inside one profile. It goes through the same create-or-pick-a-new-id path as import, so it can never overwrite a stored profile (I-12).
