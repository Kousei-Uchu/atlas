// The "How the Atlas handles your data" page (M6-05, D-060). Fixed wording, kept in one place so a test can
// check every sentence against the copy rules (docs/PRIVACY_COPY_REVIEW.md). Each claim here is backed by a
// control in docs/SECURITY_AND_PRIVACY.md. Do not say anything is private, secure, safe or anonymous.

export const ABOUT_TITLE = 'How the Atlas handles your data';

export const ABOUT_SECTIONS = Object.freeze([
  {
    id: 'stored',
    heading: 'What is stored, and where',
    body: [
      'Your charts, answers and notes are stored in this browser, on this device, and nowhere else. There is no account and no server that holds them.',
      'The app’s own files (its code and styles, not your charts) are also kept on this device so the Atlas can open without a connection.',
    ],
  },
  {
    id: 'leaves',
    heading: 'What leaves this device',
    body: [
      'Only what you choose to send out: a file you download, or a link you copy. The app does not upload anything, and it has no analytics.',
      'Like any website, the host of this page can see that the page was loaded. It cannot see your charts, because they are never sent. In a share link, everything after the # stays in your browser and is not sent when the link is opened.',
    ],
  },
  {
    id: 'sharing',
    heading: 'Sharing',
    body: [
      'A view holds only the items you pick for one audience. Anything marked sensitive or restricted needs its own choice, and notes need a separate yes.',
      'A share link or a QR code is a copy of the view. Anyone who has it can read it. It is not encrypted. Browser history, messaging apps, screenshots and synced devices may keep copies.',
    ],
  },
  {
    id: 'backups',
    heading: 'Backups and deleting',
    body: [
      'A full backup holds everything in a profile, including every note. It is not encrypted, so keep it somewhere you trust.',
      '“Delete all local data” removes every profile, answer and note from this browser. It cannot reach backup files, exports or links you have already made.',
    ],
  },
  {
    id: 'limits',
    heading: 'What the Atlas cannot do',
    body: [
      'A chart is a record of general preferences. It is not permission, and it does not replace asking. What someone says in the moment comes first.',
      'Clearing browser data, using private browsing, or switching device can remove your charts, and other people who use this browser profile may be able to read them. Export a backup regularly.',
      'The Atlas is not legal, medical or professional advice, and it cannot check that anyone who sees a chart will respect it.',
    ],
  },
]);
