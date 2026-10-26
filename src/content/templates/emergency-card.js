// Template 22: emergency information card. Restricted and hidden until turned on.
// Mostly text the person writes. Nothing is prefilled. It is restricted because it holds personal
// contact and health details, not because of its subject, so it is not marked for adults (D-037).
export default {
  templateId: 'emergency-card',
  version: 1,
  title: 'Emergency information card',
  summary: 'Who to contact, what others need to know about your health, and what you want to happen in an emergency.',
  defaultVisibility: 'hidden',
  adultIntended: false,
  isSample: false,
  statement: 'preferences-not-consent',
  categories: [
    {
      key: 'about-me',
      name: 'About me',
      sensitivity: 'restricted',
      items: [
        { key: 'me-name', type: 'text', label: 'My full name', description: 'Write it here.' },
        { key: 'me-called', type: 'text', label: 'The name I want used', description: 'Write it here.' },
        { key: 'me-language', type: 'text', label: 'Languages I speak and how I communicate best', description: 'Write it here.' },
        { key: 'me-where', type: 'text', label: 'Where I live', description: 'Write it here.' },
        { key: 'me-carry', type: 'text', label: 'Where I keep a copy of this card', description: 'Write it here.' },
      ],
    },
    {
      key: 'contacts',
      name: 'People to contact',
      sensitivity: 'restricted',
      items: [
        { key: 'contacts-first', type: 'text', label: 'First person to contact, with a number', description: 'Write the name and number here.' },
        { key: 'contacts-second', type: 'text', label: 'Second person to contact, with a number', description: 'Write the name and number here.' },
        { key: 'contacts-only-if', type: 'text', label: 'A person to contact only if needed', description: 'Write the name, number and when.' },
        { key: 'contacts-not', type: 'text', label: 'People I do not want contacted', description: 'Write their names here.' },
        { key: 'contacts-not-told', type: 'text', label: 'People who should not be told where I am', description: 'Write their names here.' },
        { key: 'contacts-health-told', type: 'text', label: 'People who may be told about my health', description: 'Write their names here.' },
      ],
    },
    {
      key: 'health',
      name: 'Health information',
      sensitivity: 'restricted',
      items: [
        { key: 'health-allergies', type: 'text', label: 'Allergies', description: 'Write them here.' },
        { key: 'health-medicines', type: 'text', label: 'Medicines I take, with doses', description: 'Write them here.' },
        { key: 'health-need-know', type: 'text', label: 'Health information that others need to know', description: 'Write it here.' },
        { key: 'health-devices', type: 'text', label: 'Medical devices or aids I use', description: 'Write them here.' },
        { key: 'health-doctor', type: 'text', label: 'My doctor or clinic', description: 'Write the name and number here.' },
        { key: 'health-cover', type: 'text', label: 'Insurance or benefit details', description: 'Write them here.' },
      ],
    },
    {
      key: 'wishes',
      name: 'What I want to happen',
      sensitivity: 'restricted',
      items: [
        { key: 'wishes-ambulance', label: 'Someone calling an ambulance for me' },
        { key: 'wishes-first-contact', label: 'Someone calling my first contact' },
        { key: 'wishes-stay', label: 'Someone staying with me' },
        { key: 'wishes-family', label: 'Someone telling my family' },
        { key: 'wishes-school-work', label: 'Someone telling my school or workplace' },
        { key: 'wishes-touch', label: 'A stranger touching me to help, such as first aid' },
        { key: 'wishes-moved', label: 'Being moved by other people' },
        { key: 'wishes-speak', label: 'Someone speaking for me if I cannot' },
        { key: 'wishes-phone', label: 'Someone using my phone to find my contacts' },
        { key: 'wishes-photos', label: 'Someone taking photos or videos of what is happening' },
      ],
    },
    {
      key: 'how-to-help',
      name: 'How to help me',
      sensitivity: 'restricted',
      items: [
        { key: 'help-calm', type: 'text', label: 'What helps me stay calm', description: 'Write it here.' },
        { key: 'help-worse', type: 'text', label: 'What makes things worse', description: 'Write it here.' },
        { key: 'help-say', type: 'text', label: 'What to say to me', description: 'Write it here.' },
        { key: 'help-cannot-speak', type: 'text', label: 'What I need if I cannot speak', description: 'Write it here.' },
        { key: 'help-other', type: 'text', label: 'Anything else a stranger should know', description: 'Write it here.' },
      ],
    },
  ],
};
