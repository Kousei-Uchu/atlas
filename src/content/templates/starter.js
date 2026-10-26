// Template 1: the starter checklist. Sample items only. Keys match the ids that
// createStarterProfile has always used, so existing profiles line up with this file.
export default {
  templateId: 'starter',
  version: 1,
  title: 'Starter checklist',
  summary: 'A few sample items to try the chart. Rename, change or delete them.',
  defaultVisibility: 'visible',
  adultIntended: false,
  isSample: true,
  statement: 'preferences-not-consent',
  categories: [
    {
      key: 'starter_contact',
      name: 'Sample: Physical contact',
      description: 'Sample items. Rename, change or delete them.',
      sensitivity: 'personal',
      items: [
        { key: 'starter_hug', label: 'A hug from a friend', sensitivity: 'normal' },
        { key: 'starter_high_five', label: 'A high five', sensitivity: 'normal' },
        { key: 'starter_shoulder', label: 'A hand on my shoulder', sensitivity: 'normal' },
        { key: 'starter_sit_close', label: 'Sitting close beside me', sensitivity: 'normal' },
      ],
    },
    {
      key: 'starter_communication',
      name: 'Sample: Communication',
      description: 'Sample items. Rename, change or delete them.',
      sensitivity: 'normal',
      items: [
        { key: 'starter_text', label: 'Being contacted by text', sensitivity: 'normal' },
        { key: 'starter_call', label: 'Being contacted by phone call', sensitivity: 'normal' },
        { key: 'starter_notice', label: 'Getting notice before a change of plans', sensitivity: 'normal' },
      ],
    },
  ],
};
