// Template data format (spec 12; M3-01). Pure: no React, no storage, no network.
// A template is a versioned data file bundled with the app. It holds definitions only, never
// answers (D-011). `src/content/templates/README.md` explains how to write one.
import { z } from 'zod';
import { LIMITS } from './limits.js';
import { ID_PATTERN } from './ids.js';
import { SENSITIVITY_LEVELS, sensitivitySchema } from './schema.js';

export const TEMPLATE_LIMITS = Object.freeze({
  categories: 30,
  itemsPerCategory: 60,
  items: 300,
  titleLength: 120,
  summaryLength: 300,
});

/** Every template carries this statement (I-02, spec 12.3). The wording lives in notices.js. */
export const TEMPLATE_STATEMENT = 'preferences-not-consent';

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const key = z.string().regex(KEY_PATTERN, 'A key uses lower-case letters, digits, hyphens and underscores');

const templateItemSchema = z.strictObject({
  key,
  type: z.enum(['state', 'text']).optional(),
  label: z.string().min(1).max(LIMITS.labelLength),
  description: z.string().max(LIMITS.descriptionLength).optional(),
  sensitivity: sensitivitySchema.optional(),
  tags: z.array(z.string().min(1).max(LIMITS.tagLength)).max(LIMITS.tagsPerItem).optional(),
});

const templateCategorySchema = z.strictObject({
  key,
  name: z.string().min(1).max(LIMITS.categoryNameLength),
  description: z.string().max(LIMITS.descriptionLength).optional(),
  sensitivity: sensitivitySchema,
  items: z.array(templateItemSchema).min(1).max(TEMPLATE_LIMITS.itemsPerCategory),
});

export const templateSchema = z.strictObject({
  templateId: z.string().regex(ID_PATTERN, 'Invalid identifier'),
  version: z.number().int().min(1),
  title: z.string().min(1).max(TEMPLATE_LIMITS.titleLength),
  summary: z.string().min(1).max(TEMPLATE_LIMITS.summaryLength),
  defaultVisibility: z.enum(['visible', 'hidden']),
  adultIntended: z.boolean(),
  isSample: z.boolean(),
  statement: z.literal(TEMPLATE_STATEMENT),
  categories: z.array(templateCategorySchema).min(1).max(TEMPLATE_LIMITS.categories),
});

/** @typedef {z.infer<typeof templateSchema>} RawTemplate */

const problem = (list, text) => { list.push(text); };

/**
 * Rules the schema cannot express. Returns a list of problems.
 * @param {RawTemplate} t
 */
function checkRules(t) {
  const problems = [];

  const seen = new Set();
  let total = 0;
  for (const category of t.categories) {
    for (const k of [category.key, ...category.items.map((i) => i.key)]) {
      if (seen.has(k)) problem(problems, `The key "${k}" is used more than once. Keys are unique across the whole template.`);
      seen.add(k);
    }
    total += category.items.length;
  }
  if (total > TEMPLATE_LIMITS.items) problem(problems, `The template has ${total} items. The limit is ${TEMPLATE_LIMITS.items}.`);

  const restricted = t.categories.some((c) => c.sensitivity === 'restricted' || c.items.some((i) => i.sensitivity === 'restricted'));
  // Restricted content is hidden until turned on. Adult-intended is a separate flag for modules whose
  // subject is relationships or the body; a restricted card of contact details need not carry it (D-037).
  if (restricted && t.defaultVisibility !== 'hidden') problem(problems, 'A template with restricted content must be hidden by default (D-008).');
  if (t.adultIntended && t.defaultVisibility !== 'hidden') problem(problems, 'An adult-intended template must be hidden by default (D-008).');
  return problems;
}

/**
 * Check a template before it is allowed into the catalogue.
 * @param {unknown} raw
 * @returns {{ ok: true, template: ReturnType<typeof normaliseTemplate> } | { ok: false, problems: string[] }}
 */
export function validateTemplate(raw) {
  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join('.') : 'template';
      return issue.code === 'unrecognized_keys' ? `${where}: unknown fields ${issue.keys.join(', ')}` : `${where}: ${issue.message}`;
    });
    return { ok: false, problems: problems.slice(0, 20) };
  }
  const problems = checkRules(parsed.data);
  if (problems.length > 0) return { ok: false, problems: problems.slice(0, 20) };
  return { ok: true, template: normaliseTemplate(parsed.data) };
}

/**
 * Fill in the defaults so the rest of the app sees one shape. An item with no sensitivity of its
 * own takes its category's. Returns a new frozen object; the input is not changed (I-05).
 * @param {RawTemplate} t
 */
export function normaliseTemplate(t) {
  const template = {
    ...t,
    categories: t.categories.map((c) => ({
      ...c,
      description: c.description ?? '',
      items: c.items.map((i) => ({
        key: i.key,
        type: i.type ?? 'state',
        label: i.label,
        description: i.description ?? '',
        sensitivity: i.sensitivity ?? c.sensitivity,
        tags: [...(i.tags ?? [])],
      })),
    })),
  };
  return deepFreeze(template);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Check a whole catalogue: every template valid, every id used once.
 * @param {unknown[]} rawTemplates
 * @returns {{ templates: ReturnType<typeof normaliseTemplate>[], problems: string[] }}
 */
export function buildCatalogue(rawTemplates) {
  const templates = [];
  const problems = [];
  const ids = new Set();
  for (const raw of rawTemplates) {
    const label = raw && typeof raw === 'object' && typeof raw.templateId === 'string' ? raw.templateId : '(unnamed)';
    const result = validateTemplate(raw);
    if (!result.ok) {
      problems.push(...result.problems.map((p) => `${label}: ${p}`));
      continue;
    }
    if (ids.has(result.template.templateId)) {
      problems.push(`${label}: the template id is used more than once`);
      continue;
    }
    ids.add(result.template.templateId);
    templates.push(result.template);
  }
  return { templates, problems };
}

/** How many categories and items a template adds, and how many are in each sensitivity level. */
export function summariseTemplate(template) {
  const bySensitivity = Object.fromEntries(SENSITIVITY_LEVELS.map((level) => [level, 0]));
  let items = 0;
  for (const category of template.categories) {
    for (const item of category.items) {
      items += 1;
      bySensitivity[item.sensitivity] += 1;
    }
  }
  return { categories: template.categories.length, items, bySensitivity };
}

/**
 * The origin recorded on a category or item made from a template (spec 5.3, 5.4). The key is
 * what lets reset and update find the same entry again after the person renames it.
 */
export function originFor(template, key) {
  return { templateId: template.templateId, templateVersion: template.version, key };
}
