// Untrusted-data gate (I-08, I-14; spec 5.7, 10.2, 10.3).
// Everything imported or decoded passes through here before reaching storage or UI.
import { LIMITS, SCHEMA_VERSION } from './limits.js';
import { UNANSWERED_ID } from './defaults.js';
import { profileSchema } from './schema.js';

export const ERROR_CODES = Object.freeze([
  'file-too-large', 'not-json', 'forbidden-key', 'too-deep', 'wrong-format',
  'newer-version', 'unknown-fields', 'schema-invalid', 'integrity-invalid', 'over-limit',
]);

const MESSAGES = {
  'file-too-large': 'This file is larger than the 4 MiB limit, so it was not opened.',
  'not-json': 'This file is not valid JSON, so it was not opened.',
  'forbidden-key': 'This file contains a reserved key name that is not allowed, so it was not opened.',
  'too-deep': 'This file is nested more deeply than allowed, so it was not opened.',
  'wrong-format': 'This does not look like an Atlas backup file.',
  'newer-version': 'This file was made by a newer version of the app. Update the app and try again.',
  'unknown-fields': 'This file contains fields this version does not recognise, so it was not opened.',
  'schema-invalid': 'Some values in this file are missing or not allowed.',
  'integrity-invalid': 'The contents of this file refer to things that do not exist or conflict with each other.',
  'over-limit': 'This file contains more entries than the app allows.',
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_PROBLEMS = 20;

/** @returns {{ ok: false, error: { code: string, message: string, problems: string[] } }} */
export function failure(code, problems = []) {
  return { ok: false, error: { code, message: MESSAGES[code], problems: problems.slice(0, MAX_PROBLEMS) } };
}

/**
 * Walk parsed JSON and reject forbidden keys and excessive depth.
 * Iterative so hostile nesting cannot overflow the call stack.
 * @returns {{ ok: true } | ReturnType<typeof failure>}
 */
export function inspectJson(root, maxDepth = LIMITS.jsonDepth) {
  const stack = [{ value: root, depth: 1, path: '$' }];
  while (stack.length > 0) {
    const { value, depth, path } = stack.pop();
    if (value === null || typeof value !== 'object') continue;
    if (depth > maxDepth) return failure('too-deep', [`Nesting passes ${maxDepth} levels at ${path}`]);
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
    for (const [key, child] of entries) {
      if (FORBIDDEN_KEYS.has(key)) return failure('forbidden-key', [`Reserved key "${key}" at ${path}`]);
      stack.push({ value: child, depth: depth + 1, path: `${path}.${key}` });
    }
  }
  return { ok: true };
}

/**
 * Parse JSON text safely. Checks size before parsing.
 * @param {string} text
 * @param {{ maxBytes?: number }} [options]
 */
export function parseJsonText(text, { maxBytes = LIMITS.backupFileBytes } = {}) {
  if (new TextEncoder().encode(text).length > maxBytes) return failure('file-too-large');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return failure('not-json');
  }
  const inspected = inspectJson(value);
  if (!inspected.ok) return inspected;
  return { ok: true, value };
}

const COUNT_LIMITS = [
  ['states', LIMITS.states], ['categories', LIMITS.categories], ['items', LIMITS.items],
  ['answers', LIMITS.answers], ['audiences', LIMITS.audiences], ['overrides', LIMITS.overrides],
  ['views', LIMITS.views],
];

/**
 * Validate a profile object: version, limits, schema, then integrity.
 * Never throws. Never repairs or drops data (I-14).
 * @param {unknown} raw
 * @returns {{ ok: true, profile: import('./schema.js').Profile } | ReturnType<typeof failure>}
 */
export function validateProfile(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return failure('schema-invalid', ['The profile is not an object.']);
  }
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) return failure('newer-version');

  // Count limits run before the schema so oversized lists are never walked by Zod.
  const over = COUNT_LIMITS
    .filter(([key, max]) => Array.isArray(raw[key]) && raw[key].length > max)
    .map(([key, max]) => `${key}: ${raw[key].length} entries, the limit is ${max}`);
  if (over.length > 0) return failure('over-limit', over);

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    const unknown = [];
    const invalid = [];
    for (const issue of parsed.error.issues) {
      const where = issue.path.length > 0 ? issue.path.join('.') : 'profile';
      if (issue.code === 'unrecognized_keys') unknown.push(...issue.keys.map((k) => `${where}.${k}`));
      else invalid.push(`${where}: ${issue.message}`);
    }
    return unknown.length > 0 ? failure('unknown-fields', unknown) : failure('schema-invalid', invalid);
  }

  const problems = checkIntegrity(parsed.data);
  if (problems.length > 0) return failure('integrity-invalid', problems);
  return { ok: true, profile: parsed.data };
}

/**
 * Cross-reference and consistency rules (spec 5.7). Returns a list of problems.
 * @param {import('./schema.js').Profile} p
 * @returns {string[]}
 */
export function checkIntegrity(p) {
  const problems = [];
  const add = (message) => { if (problems.length < MAX_PROBLEMS * 5) problems.push(message); };

  const unique = (label, ids) => {
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) add(`Duplicate ${label} id: ${id}`);
      seen.add(id);
    }
    return seen;
  };

  const stateIds = unique('state', p.states.map((s) => s.id));
  const categoryIds = unique('category', p.categories.map((c) => c.id));
  const itemIds = unique('item', p.items.map((i) => i.id));
  const audienceIds = unique('audience', p.audiences.map((a) => a.id));
  unique('override', p.overrides.map((o) => o.id));
  unique('view', p.views.map((v) => v.id));
  unique('answer', p.answers.map((a) => a.itemId));

  // States: Unanswered is a fixed, neutral member of the cycle.
  const unanswered = p.states.filter((s) => s.isUnanswered);
  if (unanswered.length !== 1 || unanswered[0].id !== UNANSWERED_ID) {
    add('There must be exactly one Unanswered state, with the id "unanswered".');
  } else {
    if (unanswered[0].cycleOrder === null) add('Unanswered must be part of the cycle.');
    if (unanswered[0].semantic !== 'neutral') add('Unanswered must have the neutral meaning.');
  }
  if (p.states.some((s) => s.id === UNANSWERED_ID && !s.isUnanswered)) add('The id "unanswered" is reserved for the Unanswered state.');
  const orders = p.states.map((s) => s.cycleOrder).filter((o) => o !== null);
  if (new Set(orders).size !== orders.length) add('Two states share the same cycle position.');

  // Categories: parents exist, no cycles, depth limit.
  const byId = new Map(p.categories.map((c) => [c.id, c]));
  for (const c of p.categories) {
    if (c.parentId !== null && !byId.has(c.parentId)) add(`Category ${c.id} has a missing parent: ${c.parentId}`);
    let depth = 1;
    const seen = new Set([c.id]);
    let cursor = c.parentId === null ? undefined : byId.get(c.parentId);
    while (cursor) {
      if (seen.has(cursor.id)) { add(`Category ${c.id} is part of a parent loop.`); break; }
      seen.add(cursor.id);
      depth += 1;
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    if (depth > LIMITS.categoryDepth) add(`Category ${c.id} is nested deeper than ${LIMITS.categoryDepth} levels.`);
  }

  const itemById = new Map(p.items.map((i) => [i.id, i]));
  const stateById = new Map(p.states.map((s) => [s.id, s]));
  for (const i of p.items) {
    if (!categoryIds.has(i.categoryId)) add(`Item ${i.id} refers to a missing category: ${i.categoryId}`);
  }

  for (const a of p.answers) {
    const item = itemById.get(a.itemId);
    if (!item) { add(`Answer refers to a missing item: ${a.itemId}`); continue; }
    const hasContent = a.stateId !== undefined || (a.text ?? '') !== '' || (a.note ?? '') !== '';
    if (!hasContent) add(`Answer for ${a.itemId} is empty. An empty answer means Unanswered and is not stored.`);
    if (item.type === 'state' && a.text !== undefined) add(`Answer for ${a.itemId} has text, but the item takes a state.`);
    if (item.type === 'text' && a.stateId !== undefined) add(`Answer for ${a.itemId} has a state, but the item takes text.`);
    if (a.stateId !== undefined) {
      const state = stateById.get(a.stateId);
      if (!state) add(`Answer for ${a.itemId} refers to a missing state: ${a.stateId}`);
      else if (state.isUnanswered) add(`Answer for ${a.itemId} stores Unanswered. Unanswered is the absence of an answer.`);
      else if (!state.isSelectable) add(`Answer for ${a.itemId} uses a state that cannot be selected: ${a.stateId}`);
    }
  }

  for (const a of p.audiences) {
    if (a.parentId !== null && !audienceIds.has(a.parentId)) add(`Audience ${a.id} has a missing parent: ${a.parentId}`);
  }
  for (const o of p.overrides) {
    if (!itemIds.has(o.itemId)) add(`Override ${o.id} refers to a missing item: ${o.itemId}`);
    if (!audienceIds.has(o.audienceId)) add(`Override ${o.id} refers to a missing audience: ${o.audienceId}`);
    if (!stateIds.has(o.stateId)) add(`Override ${o.id} refers to a missing state: ${o.stateId}`);
  }
  for (const v of p.views) {
    if (v.audienceId !== null && !audienceIds.has(v.audienceId)) add(`View ${v.id} refers to a missing audience: ${v.audienceId}`);
    for (const id of [...v.includedItemIds, ...v.restrictedOptInItemIds]) {
      if (!itemIds.has(id)) add(`View ${v.id} refers to a missing item: ${id}`);
    }
  }
  return problems;
}
