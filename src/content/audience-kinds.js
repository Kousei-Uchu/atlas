// Plain names for the kinds of audience (spec 5.6). The stored value never changes; only this wording can.
import { AUDIENCE_TYPES } from '../domain/schema.js';

export const AUDIENCE_KIND_LABELS = Object.freeze({
  everyone: 'Everyone',
  public: 'The public',
  acquaintances: 'Acquaintances',
  friends: 'Friends',
  'close-friends': 'Close friends',
  partner: 'Partner',
  family: 'Family',
  'school-work': 'School or work',
  supervisor: 'Supervisor',
  professional: 'A professional, such as a doctor',
  group: 'A group',
  individual: 'One person',
});

/** Every kind, in the order the schema lists them, with its label. */
export const AUDIENCE_KIND_CHOICES = Object.freeze(AUDIENCE_TYPES.map((value) => ({ value, label: AUDIENCE_KIND_LABELS[value] })));

export const kindLabel = (type) => AUDIENCE_KIND_LABELS[type] ?? type;
