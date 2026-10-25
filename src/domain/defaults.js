// Default states, settings and the starter profile (spec 5.2, 12.2 template 1).
import { SCHEMA_VERSION } from './limits.js';

export const UNANSWERED_ID = 'unanswered';

/** @returns {import('./schema.js').State[]} A fresh copy each call. */
export function createDefaultStates() {
  const base = { description: '', pattern: 'solid', isUnanswered: false, isSystem: false, isSelectable: true };
  return [
    { ...base, id: 'no', label: 'No', color: '#8C1D18', textColor: '#FFFFFF', icon: 'cross', semantic: 'negative', cycleOrder: 10, description: 'Not comfortable with this.' },
    { ...base, id: 'unsure', label: 'Unsure', color: '#FFE08A', textColor: '#3D2B00', icon: 'question', pattern: 'dots', semantic: 'uncertain', cycleOrder: 20, description: 'Not sure yet. Ask first.' },
    {
      ...base, id: UNANSWERED_ID, label: 'Unanswered', color: '#FFFFFF', textColor: '#1F1F1F', icon: 'circle',
      pattern: 'dashed', semantic: 'neutral', cycleOrder: 30, isUnanswered: true, isSystem: true,
      description: 'No answer recorded. This is never a yes.',
    },
    { ...base, id: 'conditional', label: 'Conditional', color: '#BFE3F5', textColor: '#0B3447', icon: 'tilde', pattern: 'stripes', semantic: 'conditional', cycleOrder: 40, description: 'Depends on the situation. Ask first.' },
    { ...base, id: 'yes', label: 'Yes', color: '#1B5E20', textColor: '#FFFFFF', icon: 'check', semantic: 'positive', cycleOrder: 50, description: 'Generally comfortable with this.' },
    { ...base, id: 'not-applicable', label: 'Not applicable', color: '#E0E0E0', textColor: '#202020', icon: 'dash', semantic: 'not-applicable', cycleOrder: null, description: 'Does not apply.' },
  ];
}

export function createDefaultSettings() {
  return {
    cycle: { endBehaviour: 'clamp' },
    interaction: { primaryDirection: 'negative' },
    restrictedModulesAcknowledged: false,
  };
}

const STARTER_ORIGIN = (key) => ({ templateId: 'starter', templateVersion: 1, key });

const STARTER_CATEGORIES = [
  { id: 'starter_contact', name: 'Sample: Physical contact', sensitivity: 'personal', sortOrder: 10 },
  { id: 'starter_communication', name: 'Sample: Communication', sensitivity: 'normal', sortOrder: 20 },
];

const STARTER_ITEMS = [
  ['starter_hug', 'starter_contact', 'A hug from a friend'],
  ['starter_high_five', 'starter_contact', 'A high five'],
  ['starter_shoulder', 'starter_contact', 'A hand on my shoulder'],
  ['starter_sit_close', 'starter_contact', 'Sitting close beside me'],
  ['starter_text', 'starter_communication', 'Being contacted by text'],
  ['starter_call', 'starter_communication', 'Being contacted by phone call'],
  ['starter_notice', 'starter_communication', 'Getting notice before a change of plans'],
];

/**
 * A new starter profile. Contains sample items only, and no answers, so every
 * item starts as Unanswered (I-01).
 * @param {{ id: string, now: string, title?: string }} args
 * @returns {import('./schema.js').Profile}
 */
export function createStarterProfile({ id, now, title = 'My profile' }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    revision: 0,
    title,
    description: '',
    createdAt: now,
    updatedAt: now,
    settings: createDefaultSettings(),
    states: createDefaultStates(),
    categories: STARTER_CATEGORIES.map((c) => ({
      ...c,
      description: 'Sample items. Rename, change or delete them.',
      parentId: null,
      visibility: 'visible',
      origin: STARTER_ORIGIN(c.id),
    })),
    items: STARTER_ITEMS.map(([itemId, categoryId, label], index) => ({
      id: itemId,
      categoryId,
      type: 'state',
      label,
      description: '',
      sortOrder: (index + 1) * 10,
      sensitivity: 'normal',
      tags: [],
      origin: STARTER_ORIGIN(itemId),
    })),
    answers: [],
    audiences: [],
    overrides: [],
    views: [],
    metadata: { templateIds: ['starter'] },
  };
}
