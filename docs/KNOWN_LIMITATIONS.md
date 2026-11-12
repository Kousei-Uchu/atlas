# Known limitations (public beta)

Plain list for people trying the beta. The security-side list is in `SECURITY_AND_PRIVACY.md`.

**Your data**
- Charts live only in this browser on this device. Clearing browser data, private browsing, or another device means they are gone. There is no sync and no account. Export a backup regularly.
- Exports and share links are not encrypted. A full backup can be locked with a password (M8-04); a forgotten password cannot be recovered, and a weak password can be guessed offline by anyone who has the file.
- Anyone who can use this browser profile can read the charts.

- Snapshots (an earlier copy of your answers, not notes or your own words) stay in a profile and in its backups until you delete them. Deleting an item does not remove it from a snapshot.

**Sharing**
- A share link or QR code is a copy. Anyone holding it can read it, and messaging apps, history, screenshots and synced devices may keep copies. The app cannot take it back.
- Very large charts (over about 100 KB) default to a file instead of a link. QR codes are only offered for short links.
- Opening a link never changes your own charts. "Save a copy" asks first.

**Offline**
- After one visit the app opens without a connection. A new version waits until you choose to reload.
- Private windows and some browsers do not allow offline use. The app still works while online.

**What the Atlas is not**
- Not consent, not legal, medical or professional advice, and it cannot check that others respect a chart.
- Adult modules are intended for adults. The app does not ask for or store age.

**Testing so far**
- Automated accessibility, keyboard, reflow, reduced-motion and forced-colours checks pass in Chromium. Real screen readers, Firefox, Safari and real phones have not been run by the builder (see M6-03).
- Not built yet: rich visualisations (M7), PDF and CSV export, community templates, sync (M8).
- Number, date and choice items (M8-05) appear in views and exports as plain words. They are left out of audience overrides, snapshots, comparison, the maps and the radial diagram, which only read state items.
