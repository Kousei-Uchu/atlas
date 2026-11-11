# 0022. Dimension map for Attraction and Gender identity and expression

Date: 2026-11-10. Status: proposed (the owner may veto). Records D-062.

**What it is.** A second way to answer the two modules that are about a person's own feelings and words. Each answerable item is its own axis. The stops on an axis are the states, written as text (Unanswered, No, Unsure, Conditional, Yes), and a person chooses a stop directly instead of clicking through the cycle. It uses the same `setItemState` command, so the map and the chart always agree.

**What it must never do.** The spec calls this a "multidimensional map", and for these two subjects that could easily become a picture that sorts a person. So the map is built to avoid that:
- No combined position, score, total, line between axes, or shape drawn from the answers.
- No label is suggested or worked out from the answers (I-10, D-008).
- The two modules are shown one at a time. Attraction answers and gender answers are never on one screen or in one drawing, because neither is used to read the other (M3-AC-05).
- "Unanswered" sits on its own at the start of each axis and is not part of the scale. It is the absence of an answer, never a midpoint.
- Text items (the person's own words) are not axes; they are counted and left in the chart.
Tests check the row shape (an item and its state only), the module separation, the stop order, and that no screen text mentions a score, total or result.

**Interaction contract.** Each axis is a radio group. Arrow keys move and choose; only the chosen stop is a Tab stop. The chosen stop shows the state's icon, pattern and text; other stops show text only (I-09). Stops wrap on narrow screens and large text. A choice is announced as "<item>: <state>".

**Empty state.** With neither module on, the panel says which modules to turn on. Hidden modules do not show.

**Export.** Nothing new. Answers export as items, exactly as before.

**Scope.** Only `attraction` and `gender-expression` (`DIMENSION_MAP_TEMPLATES`). Adding a third module is a decision, not a config change.

**Found while testing.** The cycle list includes Unanswered; the stops list would have shown it twice. Fixed and tested.
