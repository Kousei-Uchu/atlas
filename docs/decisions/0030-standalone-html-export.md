# 0030. Standalone web page export

Date: 2026-11-11. Status: proposed (the owner may veto). Records D-070. Part of M8 (M8-03).

**What it is.** "Download web page (HTML)" on a view: one `.html` file that opens in any browser, can be kept or sent, and needs no Atlas. It renders the export model and nothing else (R-05), so it holds exactly what Markdown, CSV, PDF and the pictures hold. The export leak test now includes it.

**Why it is safe to open.** The page contains no script, image, font, link, form, frame or address, and a `Content-Security-Policy` meta tag (`default-src 'none'`, inline style only, no forms, no base) means a browser would refuse any of those even if one were added by someone editing the file. All of the person's text is escaped, including the title. The referrer is not sent. Tests check for the absence of every such element and attribute, put markup in a label and a view name, and then open the saved file in a fresh page and check it makes no request, raises no policy error and has no serious accessibility violation.

**What the person sees.** Title, who it is for, date, the consent statement at the top and the bottom (I-02), the key to the states, then each group. State names are text, never colour alone (I-09). It follows the reader's light or dark setting, wraps long words, and prints in black on white.

**Not done.** The file is not signed or encrypted; the existing warning that exports are not encrypted applies to it (D-020). It carries no way back into Atlas: the backup file stays the way to move a profile.
