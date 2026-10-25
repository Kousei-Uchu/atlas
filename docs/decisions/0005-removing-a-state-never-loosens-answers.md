# 0005. Removing a state never loosens an answer

Date: 2026-10-26. Status: proposed (the user may veto).

When a state that answers use is removed, the person chooses to clear those answers (the default) or move them to another state. A move is only allowed to a state whose meaning is no more permissive than the removed one. The order, lowest to highest, is: negative; uncertain, neutral, not applicable; conditional; positive.

Why: answers hold a stable state ID, so a removal is the one palette edit that can change what an answer means. Allowing a move from No or Unsure to Yes would turn a boundary into a permission without the person ever answering again, which is the failure invariants I-01 and I-02 exist to prevent. Clearing is always safe because an unanswered item is never read as a yes.

The cost is that a person cannot move, for example, Unsure answers to Conditional in one step. They can clear them, or set the new state first. The rule lives in `domain/palette-commands.js` (`removalReplacements`), is used by both the command and the dialog, and is tested to agree.

The same file records a related rule: state names are unique ignoring case, so two states are never told apart by colour alone (I-09).
