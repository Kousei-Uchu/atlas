# 0009. Click behaviour is a profile setting, edited with radio buttons

Date: 2026-10-26. Status: proposed (the user may veto).

Click direction (D-003) and end-of-cycle behaviour (D-004) were already stored in the profile and read by the click command. M2-09 only adds the way to change them. They stay in the profile rather than moving to a device preference like the theme, because they describe how this chart is meant to be read and used. A person who exports a profile, or copies one, keeps the behaviour they chose. The theme is about the screen in front of you, so it stays on the device.

The control is two groups of native radio buttons, not a toggle or a switch. Each choice has a visible name and a sentence saying what happens, so nothing depends on guessing what "on" means. The direction choices are named after the first and last states in the cycle ("Toward No", "Toward Yes"). That keeps the wording right after a state is renamed or the cycle is reordered, and it avoids the words "negative" and "positive", which describe how states are tagged for safety checks, not how a person thinks about the order.

Going around at the end is allowed, and the panel says plainly that a click past the last state lands on the other end. It is off by default (D-004), and it can always be undone.

Both settings are ordinary undoable commands. Picking the option that is already selected does nothing and adds no undo step.
