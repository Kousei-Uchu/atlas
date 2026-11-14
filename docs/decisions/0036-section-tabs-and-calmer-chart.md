# 0036 Section tabs and a calmer chart (D-076, UX pass)

## Problem
Everything lived on one page: about fifteen feature panels and the profile and backup forms stacked under the chart, roughly 4,800 px tall on a laptop and 7,000 px on a phone. Finding Share or Settings meant scrolling past everything else. Each chart row also carried five or six full-size action buttons, so a short list looked heavy.

## Decision
- A tab bar under the header with five sections: **Chart** (the consent notice, filters and every category), **Modules**, **Explore** (timeline, dimension map, decision tree, comparison, relationship graph, radial and overlaps, body map), **Share** (audiences, views and exports) and **Settings** (palette, click behaviour, profiles, backup, storage, start from modules).
- Standard tab pattern: `tablist`, `tab`, `tabpanel`, one tab stop, arrow keys, Home and End. Tabs wrap onto a second line instead of scrolling sideways, so it works at 320 px and with large text.
- Panels are hidden, not unmounted, so open panels, filters and half-typed names survive a visit to another section.
- The URL is not used: the fragment belongs to share links (D-017).
- The consent notice stays on the Chart section where answering happens; every export still carries it (I-02).
- Quieter chart rows: management actions (Up, Down, Note, Rename, Delete) are smaller and muted, and shown in colour only for Delete. Header controls are compact only for precise pointers; touch keeps 44 px targets.

## Found and fixed during the pass
- Compact header buttons made Undo 36 px tall on a phone (the touch test caught it); compaction now applies only to `pointer: fine`.
- Hiding the profile name on phones broke the visible confirmation after switching profiles; it stays visible.

## Not changed
No behaviour, data or wording. Every panel keeps its own open and close button.

## Tests
`tests/components/section-tabs.test.jsx` (tabs, keyboard, state kept, consent notice). End-to-end tests now choose a section with `tab(page, 'Share')` (helper in `tests/e2e/fixtures.js`); the whole-app accessibility, focus and reflow checks run once per section. Component tests that exercise one panel show all sections (`renderAtlas`, see its comment).
