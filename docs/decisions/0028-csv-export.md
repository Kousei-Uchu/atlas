# 0028. CSV export

Date: 2026-11-11. Status: proposed (the owner may veto). Records D-068. Part of M8 (M8-01).

**What it is.** A fourth download beside Markdown, SVG and PNG: "Download CSV spreadsheet", on the same view. It renders the export model (`buildExportModel`) and nothing else (R-05), so the CSV holds exactly what the view includes and nothing it holds back. Restricted items, private notes, other audiences' reasons and snapshots cannot appear, and the export leak test now covers the CSV text too.

**Layout.** Title, audience, date and the fixed consent statement first; then one header row (Group, Item, Answer, plus Note only when notes are on and a shareable note is in the export) and one row per item; then the legend as State and Meaning; then the consent statement again at the end (I-02). Text items put the person's words in the Answer column, or "(nothing written)". Unanswered stays the word the state shows (I-01); an unanswered item is never an empty cell.

**Format.** RFC 4180: every cell quoted, quotes doubled, CRLF rows, UTF-8 with a byte-order mark so spreadsheet programs read non-English text. Control characters are dropped.

**Spreadsheet formulas.** A label, note or answer is the person's own text, and a spreadsheet runs a cell that starts with `=`, `+`, `-` or `@` as a formula (and `HYPERLINK` or `cmd` style cells can reach out). Any cell that starts with one of those, a tab, a carriage return or whitespace followed by one, gets a leading apostrophe, which spreadsheets show as plain text. Only exported text changes; the stored data does not. The cost is a visible apostrophe in cells like "-1", which is the safer failure.

**Not done.** No share-link or backup change. A CSV cannot be imported back; the backup file stays the way to move a profile.

**Tests.** Unit: BOM, CRLF, header, answers, legend, consent statement twice, Note column rules, quoting, formula cases, empty text, control characters, leak test, filename. E2E (desktop and phone): button disabled until the view includes something, file name, contents, announcement.
