# 0013. Audiences, overrides and conflicts

Date: 2026-10-26. Status: proposed (the user may veto). Records D-040, D-041 and D-042.

**Audiences.** An audience is a name, a kind and an optional description. Names are unique ignoring case, so two audiences are never told apart by position alone on the review screen. The `parentId` field stays reserved and unused (O-009); the commands never set it. Deleting an audience removes its overrides and says how many. It is refused while a view is built on it, because dropping the overrides could make that view show the default answer, which may be more open than what the person chose for that audience. The person changes or removes the view first.

**Overrides.** There is one override per item and audience. Setting it again replaces the old one (and keeps its id), including a conflicting pair that came in from an import, because the person has now made a choice. An override can show any selectable state or Unanswered. Only items that take a state can have one. It never edits the item's own answer (I-04). An override may be more open than the default, since that is the whole point of choosing who sees what, but the resolution says so (`moreOpenThanDefault`) so the screen can state it in words. "More open" uses the same ranking as removing a state (D-026), where Unanswered ranks above No.

**Resolution.** An enabled override wins, otherwise the item's own answer, otherwise Unanswered (spec 7). Each result carries its source and the person's own reason, and `explainResolution` turns that into a plain sentence. An override that points at a missing state falls to Unanswered, never to a positive state (I-01).

**Conflicts.** Two enabled overrides for one item and audience that name different states are a conflict. Nothing is chosen for the person: the value falls to Unanswered with `source: 'conflict'`, and the order of the overrides decides nothing (D-013). Any export or view that sees a conflict must refuse to build until the person keeps one; that rule is enforced where views and exports are built (M4-04 and M4-06). Two enabled overrides that agree are not a conflict.
