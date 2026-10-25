// Strict Zod schemas for schema version 1 (spec 5).
// Structure only. Cross-reference rules live in validation.js.
import { z } from 'zod';
import { LIMITS, SCHEMA_VERSION } from './limits.js';
import { ID_PATTERN } from './ids.js';

const id = z.string().regex(ID_PATTERN, 'Invalid identifier');
const nullableId = id.nullable();
const hexColour = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colour must be #RRGGBB');
const isoDate = z.iso.datetime();
const sortOrder = z.number().int().min(-1_000_000).max(1_000_000);

export const STATE_ICONS = ['check', 'cross', 'question', 'tilde', 'dash', 'circle', 'dot', 'star', 'heart', 'pause'];
export const STATE_PATTERNS = ['solid', 'stripes', 'dots', 'dashed'];
export const STATE_SEMANTICS = ['positive', 'conditional', 'negative', 'uncertain', 'neutral', 'not-applicable'];
export const SENSITIVITY_LEVELS = ['normal', 'personal', 'sensitive', 'restricted'];
export const AUDIENCE_TYPES = [
  'everyone', 'public', 'acquaintances', 'friends', 'close-friends', 'partner',
  'family', 'school-work', 'supervisor', 'professional', 'group', 'individual',
];

export const sensitivitySchema = z.enum(SENSITIVITY_LEVELS);

export const stateSchema = z.strictObject({
  id,
  label: z.string().min(1).max(LIMITS.stateLabelLength),
  description: z.string().max(LIMITS.stateDescriptionLength),
  color: hexColour,
  textColor: hexColour,
  icon: z.enum(STATE_ICONS),
  pattern: z.enum(STATE_PATTERNS).nullable(),
  cycleOrder: z.number().int().min(-1_000_000).max(1_000_000).nullable(),
  semantic: z.enum(STATE_SEMANTICS),
  isUnanswered: z.boolean(),
  isSystem: z.boolean(),
  isSelectable: z.boolean(),
});

const origin = z
  .strictObject({
    templateId: id,
    templateVersion: z.number().int().min(1),
    key: z.string().min(1).max(120),
  })
  .nullable();

export const categorySchema = z.strictObject({
  id,
  name: z.string().min(1).max(LIMITS.categoryNameLength),
  description: z.string().max(LIMITS.descriptionLength),
  parentId: nullableId,
  sortOrder,
  visibility: z.enum(['visible', 'hidden']),
  sensitivity: sensitivitySchema,
  origin,
});

export const itemSchema = z.strictObject({
  id,
  categoryId: id,
  type: z.enum(['state', 'text']),
  label: z.string().min(1).max(LIMITS.labelLength),
  description: z.string().max(LIMITS.descriptionLength),
  sortOrder,
  sensitivity: sensitivitySchema,
  tags: z.array(z.string().min(1).max(LIMITS.tagLength)).max(LIMITS.tagsPerItem),
  origin,
});

export const answerSchema = z.strictObject({
  itemId: id,
  stateId: id.optional(),
  text: z.string().max(LIMITS.textLength).optional(),
  note: z.string().max(LIMITS.noteLength).optional(),
  noteShareable: z.boolean(),
});

export const audienceSchema = z.strictObject({
  id,
  name: z.string().min(1).max(LIMITS.categoryNameLength),
  type: z.enum(AUDIENCE_TYPES),
  description: z.string().max(LIMITS.descriptionLength),
  parentId: nullableId,
});

export const overrideSchema = z.strictObject({
  id,
  itemId: id,
  audienceId: id,
  stateId: id,
  enabled: z.boolean(),
  explanation: z.string().max(LIMITS.descriptionLength),
});

export const viewSchema = z.strictObject({
  id,
  name: z.string().min(1).max(LIMITS.categoryNameLength),
  audienceId: nullableId,
  includedItemIds: z.array(id).max(LIMITS.items),
  includeSensitive: z.boolean(),
  restrictedOptInItemIds: z.array(id).max(LIMITS.items),
  includeNotes: z.boolean(),
  visualization: z.strictObject({
    type: z.string().min(1).max(40),
    options: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()])),
  }),
});

export const settingsSchema = z.strictObject({
  cycle: z.strictObject({ endBehaviour: z.enum(['clamp', 'loop']) }),
  interaction: z.strictObject({ primaryDirection: z.enum(['negative', 'positive']) }),
  restrictedModulesAcknowledged: z.boolean(),
});

export const profileSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id,
  revision: z.number().int().min(0),
  title: z.string().min(1).max(LIMITS.titleLength),
  description: z.string().max(LIMITS.descriptionLength),
  createdAt: isoDate,
  updatedAt: isoDate,
  settings: settingsSchema,
  states: z.array(stateSchema).max(LIMITS.states),
  categories: z.array(categorySchema).max(LIMITS.categories),
  items: z.array(itemSchema).max(LIMITS.items),
  answers: z.array(answerSchema).max(LIMITS.answers),
  audiences: z.array(audienceSchema).max(LIMITS.audiences),
  overrides: z.array(overrideSchema).max(LIMITS.overrides),
  views: z.array(viewSchema).max(LIMITS.views),
  metadata: z.strictObject({ templateIds: z.array(id).max(100) }),
});

/**
 * @typedef {z.infer<typeof profileSchema>} Profile
 * @typedef {z.infer<typeof stateSchema>} State
 * @typedef {z.infer<typeof categorySchema>} Category
 * @typedef {z.infer<typeof itemSchema>} Item
 * @typedef {z.infer<typeof answerSchema>} Answer
 */
