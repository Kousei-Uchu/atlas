# 0029. PDF through the browser's print

Date: 2026-11-11. Status: proposed (the owner may veto). Records D-069. Answers open question O-007 (a PDF approach that stays fully local). Part of M8 (M8-02).

**Decision.** No PDF library. A "Print or save as PDF" button lays the export model out as a document (`PrintSheet`) and calls the browser's own print, where "Save as PDF" is a standard choice on every desktop browser and in the share sheet on iPhone and iPad. This keeps the app small, adds no dependency or code to audit, makes no request, and the PDF is made by the person's browser on their device.

**What is on the page.** The same export model as Markdown, CSV, SVG and PNG, so a view's held-back items, private notes and snapshots cannot appear (R-05). Title, who it is for, date, the consent statement at the top and the bottom (I-02), the key to the states, and each group with its items. State names are text, so the page reads the same printed in black and white or by a screen reader (I-09). Long words wrap and a group heading is kept with its first item.

**How it prints.** The page is added directly under `<body>` while printing and is hidden on screen. During the print, `data-print="export"` hides everything else in the document, so the PDF holds only these pages rather than the app. When the print dialog closes (`afterprint`, or the window getting focus back for browsers that do not send it) the page and the attribute are removed. Nothing is stored.

**Known limits.** The look of the PDF (paper size, headers and footers, margins) is up to the browser's print dialog; the page asks only for black text on white. Some mobile browsers have no "Save as PDF" and offer only printers. The button says "Print or save as PDF" so that is not a surprise.

**Tests.** E2E (desktop and phone): disabled until the view includes something; the page is hidden on screen and visible in print media; contains the view's items and the statement twice, and not an item the view leaves out; the app is hidden in print; Chromium's own PDF of the layout is a valid, one-page PDF; the page is removed after printing and can be made again.
