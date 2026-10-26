# 0011. Modules are templates added to a profile, and the adult note is enforced by the command

Date: 2026-10-26. Status: proposed (the user may veto).

A module has no record of its own. It is just the categories and items that came from a template, found again through their `origin`. That keeps backups, copies and undo working with no new structure, and it means a person can still rename or delete anything a module added.

Hiding a module only changes `visibility` on its categories. Items and answers are not touched, so hiding is safe and reversible, and turning the module back on shows exactly what was there. Adding a module never creates an answer, so everything in it starts as Unanswered.

The adult note (D-009) is checked inside the commands, not only on the screen. Adding a module visible, or turning one on, fails unless the caller says the note was acknowledged. Adding it hidden, and hiding it, need nothing, because nothing is shown. The note appears every time an adult-intended module is turned on, not once per profile. It is short, and a person who turned a module off and back on should not have the wording skipped. Acknowledging sets `restrictedModulesAcknowledged`, which holds no age and no date.

The library lists every template except the sample, each with a status and a single button. Reset and update are left to M3-06, because they need a way to show the person what will change before it does.
