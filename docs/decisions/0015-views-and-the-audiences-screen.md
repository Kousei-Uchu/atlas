# 0015. The inclusion rule is recomputed every time, and the audiences screen settles conflicts by asking

Date: 2026-10-31. Status: proposed (the user may veto). Records D-044 and D-045.

**A view is an allowlist, and the rule lives in one function (D-044).** `evaluateView` in `view-inclusion.js` decides, item by item, what a view includes. An item is in only if it is picked, its category and every category above it is showing, its level passes the gate, and it has no conflict for the view's audience. The level is the higher of the item's own and its category's (D-015). Sensitive items need the view's `includeSensitive`. Restricted items need a per-item opt-in, and the sensitive switch never opens them. A note travels only when the view includes notes and the answer's own `noteShareable` is on.

Nothing is remembered as approved. The rule is recomputed from the profile each time, so raising an item's level after it was picked and opted in holds it back at once, and hiding a category holds its items back without anyone editing the view.

A held-back entry carries no value and no note, only its label and the reason. A consumer that forgets to filter still cannot leak what was held back (I-11). The label stays so the review screen can say what was held back and why.

**An opt-in dies with the pick.** Taking an item off a view also drops its restricted opt-in. Picking it again later asks again, so an old choice never shares a restricted item. An opt-in can only be made for an item that is picked and restricted, so a stored opt-in never exists for an item that needs none.

**Conflicts block a view only where they would show (D-044).** D-042 says a view that sees a conflict must refuse to build. "Sees" is taken as: an item the view includes, for the view's own audience, that would otherwise pass every other gate. A conflict on an item that is not picked, on another audience, or on an item already held back for another reason changes nothing that leaves, so it does not stop the person. The conflicted item itself is held back with its own reason, and the screen says to keep one override. A view whose audience no longer exists is also not buildable. The delete rule (0013) makes that unlikely, but an imported profile could carry it.

**Views start empty, and all switches start off.** A new view includes nothing, no sensitive items, no restricted items and no notes. The only way a view gets more open is a choice made through a command.

**The audiences screen never settles anything for the person (D-045).** An audience is added and edited in a closed-by-default panel. Deleting asks first and says how many overrides go, and the command still refuses while a view uses the audience. Conflicts are listed at the top, and also announced while the panel is closed so they are not missed. Each side is shown with its reason, and the person keeps one. The others are removed in the same step, which is the replace-the-pair rule from 0013.

The override control lives on the item, behind an Audiences button, because that is where the person is looking at the answer it modifies. It offers "Same as my answer", every state and Unanswered. Each line says in a sentence what the audience sees and why, and says so when it shows more than the person's own answer. Choosing "Same as my answer" removes the override. Nothing in either place edits an answer (I-04).

Hidden text in a button name is joined with an explicit space outside the span, as the Modules panel does. A test caught that a leading space inside a visually hidden span is lost from the accessible name, which would read as "EditFriends".
