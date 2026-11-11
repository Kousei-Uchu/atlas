# 0026. Relationship graph over the audiences

Date: 2026-11-11. Status: proposed (the owner may veto). Records D-066.

**What it is.** The spec lists "relationship graph" with no detail beyond section 13, so this is a proposal. The profile already has audiences, and each has a `parentId` that had no way to be set. The graph shows "Me" at the root with each audience inside the one it was placed in. It adds one command, `setAudienceParent`, so a person can say that "Close friends" sits inside "Friends". Nothing else is new data, and no positions are stored (spec 13): layout is worked out from the structure in `visualisations/relationship-graph/layout.js`, a versioned file.

**What it must never do.** A graph of people invites ranking them. So position, distance, size and colour carry no meaning, there is no closeness, strength or trust measure, and the only numbers are plain counts of what the person set for that audience (changes, saved views, answers that differ from their own). Tests check the node shape and screen text for rating words (I-10).

**Contract.**
- Data: `relationshipGraph(profile)`, pure. Reading order is parent, then its children, in the order audiences are kept. A missing parent or a loop never hides an audience: it shows at the top level.
- Editor interaction: a select beside each audience, "Place <name> inside", through `run` (I-05), announced politely. An audience is never offered itself or one of its own children, and the command refuses those anyway. Undo works as for any command; setting the same place again adds no step.
- Integrity: `validateProfile` now rejects a loop of audience parents. No older data can have one, because the parent was always empty, so no migration is needed.
- Keyboard and touch: only native selects. The drawing has no controls.
- Text alternative: the nested list is the content. The drawing is `aria-hidden`, because it adds nothing the list lacks, and it scales to the screen width rather than scrolling.
- Empty state: with no audiences the panel says to add one in the Audiences panel.
- Export: nothing new. Audience structure is not part of any view, export or share link, as before.

**Tests.** Domain: empty, nesting and order, counts, broken parent and loop, layout, the command's refusals, validation. E2E (desktop and phone): empty hint, placing and clearing, never offering itself or a child, axe in three themes, 320 px.
