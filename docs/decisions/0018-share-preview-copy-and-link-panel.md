# 0018. Opening a link is read-only, saving a copy is explicit, and the link panel says what it is

Date: 2026-11-06. Status: proposed (the user may veto). Records D-051, D-052 and D-053.

**Preview (D-051).** `Root` reads the fragment before anything else. With a share fragment it renders `SharedChartPage` instead of the app, so no storage is opened and no existing profile can be touched. The page shows the decoded chart as plain text (labels, notes, text, state badges with their labels), the not-saved note, and the fixed consent statement. A link that fails shows the plain reason from the codec and a way back. Leave and Save both remove the fragment with `history.replaceState`, so the link is not left in the address bar or in a new history entry.

**Save a copy (D-052).** It asks first. It makes one new profile through the same path as a backup import, so an id clash is handled and nothing is merged or overwritten (I-12). The envelope carries no sensitivity, so categories are 'personal'; the person can change that in the copy. Notes come across but are not marked shareable, so a copy cannot be re-shared with another person's notes by accident. If a chart uses all 24 states, one more than fits beside Unanswered, the states that do not fit are not kept and their answers are left out. That is safe, because absence of an answer is Unanswered and never a yes (I-01). The profile description says how many were dropped.

**Link panel (D-053).** The panel is under Export so a link comes from the same review as a download and the same export model (I-11). The fixed privacy copy is on screen before a link exists (I-07), and no text calls a link private, secure or encrypted. The link is measured whole, since that is what a messaging app carries (R-11). Bands follow spec 11.5, with 1 KB as 1024 bytes. A link over 100 KB hides the copy button and the link until the person asks to see it, and a Markdown file is offered from 32 KB. The link is dropped if the view changes, so it cannot be out of date, and a hand-copy box is always there for browsers that refuse clipboard access.

**Not decided here.** QR codes for small links (M5-04) and the private alpha gate (M5-05).
