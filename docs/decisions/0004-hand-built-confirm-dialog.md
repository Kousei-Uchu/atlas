# 0004. Confirmation dialog is hand-built

Date: 2026-10-26. Status: accepted.

Destructive actions use `role="alertdialog"` built by hand rather than `<dialog>.showModal()`. Focus starts on Cancel (the safe choice), Tab wraps between the two buttons, Escape cancels, and focus returns to the opener. This behaves the same in every supported browser and in the jsdom test environment, and is covered by component and e2e tests. If more dialogs with more controls are added, revisit with `showModal()` or a focus-trap helper.
