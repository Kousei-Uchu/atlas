# 0006. Contrast is advice, and the theme is a device preference

Date: 2026-10-26. Status: proposed (the user may veto).

Contrast: a state's text and border colour is compared with its background using WCAG 2.x. A weak pair shows a warning in words with the ratio and a way to fix it. It never blocks saving and never alters the stored colours, because colour is display only (I-03) and every state is also told apart by label, icon and border pattern (I-09). The warning is a plain paragraph, not a live region, so typing a hex code does not flood a screen reader.

Theme: the choice (device, light, dark, high contrast) is stored in the `settings` store under its own key, not in the profile. It therefore never appears in a backup and cannot affect an answer. Unknown stored values are ignored and the app follows the device. High contrast replaces each state's custom colours with the theme's colours (an `!important` rule beats the inline custom properties React sets), so no palette can make a label unreadable.

Cost: the dark values are written twice in `tokens.css` (device setting and explicit choice), guarded by a test. A non-system theme can flash briefly on load, because the CSP forbids an inline early script and the choice lives in IndexedDB.
