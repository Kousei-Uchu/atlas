# 0007. Search ignores notes, and reordering uses buttons

Date: 2026-10-26. Status: proposed (the user may veto).

Search: it matches an item's label, description and tags plus the names of the categories above it, with every typed word required, ignoring case and accents. Notes and written answers are left out. A note is private writing, and showing a row because of a note could surface it to someone looking over a shoulder at a search term they did not expect. The cost is that a person cannot find an item by what they wrote in its note. If that is wanted later it should be a separate, clearly labelled option.

Filters are display only and are not saved. While a filter is on, move buttons are hidden, because moving a row that is one of three shown out of twelve has no clear meaning. Add-item forms are hidden while a search is typed so a new item is not added somewhere the person cannot see it.

Reordering: Up and Down buttons, not drag. Buttons work for keyboard, switch and screen reader users with no extra code paths, and drag can be added later on top of the same `moveItem` and `moveCategory` commands. Each move renumbers the siblings (10, 20, 30...), which also repairs ties from imports. Hidden categories are stepped over so each press visibly moves something. After a move, focus is put back on the button that was pressed, or on its opposite when the move reached an end and disabled it, because re-ordering the DOM can drop focus in some browsers.
