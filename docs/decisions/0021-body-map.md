# 0021. Body map: a second way to answer the Body contact map module

Date: 2026-11-10. Status: proposed (the owner may veto). Records D-061.

**Data contract.** The map has no data of its own. The Body contact map module (template 23) has five groups ("Touch from friends", "family", "a partner", "someone I do not know well", "a carer or health worker"). Each group has one item per region, keyed `<group>-<region id>`. The geometry (`src/visualisations/body-map/geometry.js`, version 1) holds the shapes. The profile stores only item answers, never coordinates, so a redraw cannot change an answer.

**No private parts.** The map is a set of abstract shapes for head, face, neck, shoulders, arms, hands, chest, stomach, back, hips and sides, legs, knees and feet. Private parts are not drawn and not listed. They stay in the Anatomy and compatibility module as text, behind the mature-phrasing toggle (D-043). Left and right are one region. A test fails if a region is named for a private part.

**Interaction contract.**
- The list beside the map is the accessible way in: a table with a real button per region (same states, same primary and secondary actions, same announcements as the chart).
- The drawn regions are for pointer and touch (click or tap steps forward, right click goes back). They are hidden from assistive technology and are not Tab stops, so nothing is read twice.
- Colour is never the only cue (I-09): each region shows the state's icon and pattern, and the table shows the answer as text.
- Hovering or focusing a row outlines its region, and the reverse.
- The group chosen is page state, not stored (visualisation settings stay out of the profile).

**Empty and invalid states.** No module, or the module hidden: the panel says how to turn it on. A region whose item was deleted: shown faded, marked "Not in this chart", not clickable. Items the person added to a group themselves: not on the map, counted in a note, still in the chart.

**Export.** No map image in this version. Items in this module export as text like any others when included in a view (the leak tests still apply). A map image export is a possible later step, using the same export model.

**Spec table.** The module stays restricted, hidden by default and intended for adults, as spec 12.2 lists. Because the regions are non-private and the groups include friends and family, the owner may prefer visible, "personal" and not adult-intended. That is open question O-011; the default follows the spec.

**Tests.** Geometry (ids, bounds, mirroring, no private names, template keys match), selectors, and 7 browser tests on desktop and phone including axe in three themes and 320 px reflow.
