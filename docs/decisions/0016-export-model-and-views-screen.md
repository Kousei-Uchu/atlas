# 0016. One export model feeds every format, and the views screen shows what is held back

Date: 2026-11-02. Status: proposed (the user may veto). Records D-046 and D-047.

**One model, three renderers (D-046).** `buildExportModel` turns a view into plain data: title, audience name, date, the fixed consent statement, a legend, sections and items. Markdown, SVG and PNG all render from it, so they cannot disagree. It builds on `evaluateView`, so it inherits the inclusion rule, and it refuses when the view is missing, has a problem or conflict, or includes nothing. It holds no ids, no held-back items, no other audiences and no profile title. Tests search every output for held-back labels and notes.

State is never colour alone (I-09): each state has a label, an icon shape and a pattern in the picture, and a key in every export.

**The screen (D-047).** "Views and exports" is a closed-by-default panel. A new view includes nothing. The picker marks sensitive and restricted items before they are picked, using the effective level (an item's own or its category's, whichever is higher). The review lists what is included, then what is held back with the reason, and offers a per-item tick for restricted items.

SVG uses only plain elements and system fonts, with no script, image or foreignObject, and text is XML-escaped. PNG draws that SVG as a `data:` image on a canvas, so nothing is fetched. The Markdown preview is a read-only text box, not a `pre`, so keyboard users can scroll it without a non-interactive tab stop.
