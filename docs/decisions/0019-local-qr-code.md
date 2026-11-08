# 0019. QR codes come from a small encoder in the app, and only for short links

Date: 2026-11-07. Status: proposed (the user may veto). Records D-054.

**No library.** The app has a strict policy of nothing fetched and a short dependency list (I-06). A QR encoder for byte mode is about 250 lines, so `share/qr.js` is part of the app: Reed-Solomon over GF(256), block interleaving from the standard's block table (levels L and M, versions 1 to 40), the function patterns, mask choice by penalty score, and format and version information. The block tables are standard data. Only level M is used by the app. Level L is in the encoder for tests and for later use.

**Checked against what phones do.** Tests encode text of many lengths (on both sides of the version changes, both levels, UTF-8 included), draw it as pixels with a quiet zone, and scan it with jsQR, which is a dev-only dependency and does not ship. The Playwright test draws the page's own SVG onto a canvas and scans that, in Light, Dark and High contrast. jsQR cannot read version 23 at level L, and another encoder's code for that version fails in it too, so that single size is skipped in the unit test.

**Short links only.** A QR code is offered for links up to 800 bytes. Past that the code is too dense to scan reliably from a screen (R-11), so the panel says so and the file offer stays. The code is always black on white with a four-module quiet zone, whatever the theme, because scanners need that contrast. It is an inline SVG with a text label, never an image to fetch, and it comes with a reminder that anyone who scans it can read the chart.
