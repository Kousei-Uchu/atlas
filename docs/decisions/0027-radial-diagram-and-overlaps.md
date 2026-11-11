# 0027. Radial diagram and overlapping regions

Date: 2026-11-11. Status: proposed (the owner may veto). Records D-067.

**What it is.** The spec lists "overlapping regions and radial diagram" with no detail beyond section 13, so this is a proposal, in one panel with two read-only pictures. Neither has data of its own and nothing is stored: shapes come from counts, in the versioned file `visualisations/radial/layout.js`.

1. **Radial diagram.** One equal wedge per visible top-level group, numbered in chart order. Along a wedge, one segment per answered state, as long as the number of answers in that state, with colour and pattern from the state itself (I-09). Wedge size, order and angle mean nothing. There is no total, average or score (I-10). Unanswered is the absence of an answer (I-01): it is counted in the list and is never a segment. At most 24 wedges are drawn; the rest are said to exist.
2. **Overlap of two audiences.** The questions in visible groups, sorted by what each audience sees (default answer or its own override): answered for both (split into same answer and different answers), answered for the first only, answered for the second only. Two circles show the three counts. Nothing says how alike two audiences are, and Unanswered is never a match.

**Contract (spec 13).**
- Data: `radialSummary(profile)` and `audienceOverlap(profile, a, b)`, both pure and read-only. Hidden groups are left out of both. A missing or identical audience is refused with a message.
- Editor interaction: none beyond native selects to choose the two audiences. Nothing is edited (I-05).
- Keyboard and touch: only native selects. The drawings have no controls and are not Tab stops.
- Text alternative: the lists are the content. The radial list gives each group with its counts; the overlap gives three sentences and then the items in each region, with every state written as text. The drawings are `aria-hidden`, scale to the screen width and never scroll sideways.
- Empty states: nothing on the chart, and fewer than two audiences, each say what is needed. Two audiences with nothing answered show zeros.
- Export: nothing new. Neither picture is exported or shared.
- Shared code: the SVG pattern fills moved from the body map to `components/PatternDefs.jsx` so both pictures draw states identically.

**Tests.** Domain: empty, counts per state, Unanswered kept apart, hidden groups, layout shapes, every overlap region, refusals, no mutation, no scoring keys. E2E (desktop and phone): list first with hidden drawing, two audiences in words, axe in three themes, 320 px.
