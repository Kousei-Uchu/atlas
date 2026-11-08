# 0014. Mature phrasing is a second wording for the same entry, chosen per profile

Date: 2026-10-27. Status: proposed (the user may veto). Records D-043.

The content rule said templates contain no explicit sexual wording (spec 12.3). That keeps the default calm, but it also means a person who wants to say exactly what they are and are not comfortable with has only general words to use, such as "touch that goes further". General wording can hide the very thing a boundary chart is for. So the rule now has a switch: plain wording for everyone by default, and direct wording for an adult who turns it on.

**One entry, two wordings, one key.** An item or category in an adult-intended template can carry `mature: { label, description }` (or `{ name, description }` for a category). The key, sensitivity, type and order are shared. Because the key does not change, update and reset find the same entry in either phrasing, and a backup or an undo needs nothing new. The alternative, separate mature-only items, would have made items appear and disappear when the switch moved, and would have left answers attached to things that were then hidden.

**The choice lives in the profile, not on the device.** Like the click settings (0009), it describes how this chart is meant to be read, and it travels with a backup and a copy. The theme stays a device preference because it is about the screen. The setting is optional in the schema, so profiles and backups made before it existed still load and read as off.

**Switching rewrites wording, and only untouched wording.** Wording is stored in the profile, so turning the setting on has to change what is stored. `setMaturePhrasing` compares each field of each module entry with the template's wording in the other phrasing and swaps it only when they match. A label the person renamed, or a description they rewrote, is left exactly as it is, and each field is judged alone. Answers, notes, order, visibility and sensitivity are never read or written. The whole switch is one undo step.

**The note comes first, and the command enforces it.** Turning on needs `acknowledge: true`, the same way adult modules do (D-009). The dialog shows the note, with Cancel focused and Escape cancelling. Turning it off needs nothing.

**Guards.** A template may carry mature wording only if it is adult-intended, so a module that is shown by default can never contain it. The mature wording must differ from the plain wording and must stay unique inside the template. Tests scan the plain wording for explicit words, and the mature wording for slang, erotic and fetish words, so the direct wording stays clinical ("oral sex", "vaginal intercourse", "penis", "vulva"). The anatomy module's mature wording is also checked for gender words, so bodies and gender stay apart (I-10).

**Body parts and "Not applicable".** The new anatomy items are about sight, touch and care, one place at a time. None assumes a person has a given part, and every one can be answered Not applicable. Biological sex is a text item the person writes, and nothing suggests or fills in a value. Gender is not mentioned. The plain wording uses the general words "private parts", "front passage" and "back passage". The only explicit-scan exception is the phrase "biological sex", which is a fact about a body and not sexual wording.

**Giving and receiving are separate items,** and so are the front and back passages, so a yes to one never reads as a yes to another. This follows the way attraction is listed (I-10) and the rule that a chart is not permission (I-02).

**Existing profiles.** Both changed modules are version 2, so a profile that has them shows Update available. Update only adds the new categories and items, in the profile's current phrasing, and does not change existing wording (D-038).
