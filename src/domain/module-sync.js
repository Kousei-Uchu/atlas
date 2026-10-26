// Keeping a module in step with its template (M3-06). Pure, same contract as commands.js (I-05).
//
// Two commands, both matching by the template key stored in `origin.key`, never by wording:
//   updateModule  adds what the template has and the profile lacks. It never changes wording.
//   resetModule   does that, and also puts the template's wording and order back.
//
// Neither ever touches an answer or a note (I-01, I-03, D-011), never deletes anything the person
// made or still has, and never lowers a sensitivity level (D-032). Entries the template no longer
// has are left alone. The template of an earlier version is not stored, so "missing" means "not in
// the profile under that key": something the person deleted comes back, and the confirmation says
// how many and which (D-038).
import { LIMITS } from './limits.js';
import { SENSITIVITY_LEVELS } from './schema.js';
import { newId } from './ids.js';
import { idFactory } from './module-commands.js';
import { originFor } from './templates.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });

const rank = (level) => SENSITIVITY_LEVELS.indexOf(level);
const higher = (a, b) => (rank(a) >= rank(b) ? a : b);
const sameTags = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function usable(template) {
  return template !== null && typeof template === 'object' && typeof template.templateId === 'string' && Array.isArray(template.categories);
}

/** The module's own entries in a profile, found by origin and indexed by template key. */
function own(profile, templateId) {
  const categories = profile.categories.filter((c) => c.origin?.templateId === templateId);
  const items = profile.items.filter((i) => i.origin?.templateId === templateId);
  const byKey = (list) => { const map = new Map(); for (const e of list) if (!map.has(e.origin.key)) map.set(e.origin.key, e); return map; };
  return { categories, items, categoryByKey: byKey(categories), itemByKey: byKey(items) };
}

/**
 * What an update or a reset would do to this profile. Changes nothing.
 * @returns {{
 *   present: boolean, installedVersion: number|null, latestVersion: number,
 *   updateAvailable: boolean, newerInProfile: boolean,
 *   addCategories: Array<{ key: string, name: string, items: number }>,
 *   addItems: Array<{ key: string, label: string, category: string }>,
 *   differing: Array<{ kind: 'category'|'item', key: string, name: string }>,
 *   retired: number,
 * }}
 */
export function planModuleSync(profile, template) {
  const empty = {
    present: false, installedVersion: null, latestVersion: usable(template) ? template.version : 0,
    updateAvailable: false, newerInProfile: false, addCategories: [], addItems: [], differing: [], retired: 0,
  };
  if (!usable(template)) return empty;
  const mine = own(profile, template.templateId);
  if (mine.categories.length === 0 && mine.items.length === 0) return empty;

  const versions = [...mine.categories, ...mine.items].map((e) => e.origin.templateVersion);
  const installedVersion = Math.min(...versions);
  const addCategories = [];
  const addItems = [];
  const differing = [];
  const templateKeys = new Set();

  for (const category of template.categories) {
    templateKeys.add(category.key);
    const existing = mine.categoryByKey.get(category.key);
    if (!existing) {
      addCategories.push({ key: category.key, name: category.name, items: category.items.length });
      for (const item of category.items) templateKeys.add(item.key);
      continue;
    }
    if (existing.name !== category.name || existing.description !== (category.description ?? '')) {
      differing.push({ kind: 'category', key: category.key, name: existing.name });
    }
    for (const item of category.items) {
      templateKeys.add(item.key);
      const found = mine.itemByKey.get(item.key);
      if (!found) { addItems.push({ key: item.key, label: item.label, category: existing.name }); continue; }
      if (found.label !== item.label || found.description !== (item.description ?? '') || !sameTags(found.tags, item.tags ?? [])) {
        differing.push({ kind: 'item', key: item.key, name: found.label });
      }
    }
  }
  const retired = [...mine.categories, ...mine.items].filter((e) => !templateKeys.has(e.origin.key)).length;

  return {
    present: true,
    installedVersion,
    latestVersion: template.version,
    updateAvailable: installedVersion < template.version,
    newerInProfile: Math.max(...versions) > template.version,
    addCategories, addItems, differing, retired,
  };
}

/** Everything a sync has to make: new categories and items, with their identifiers, or an error. */
function build(profile, template, plan, mine, makeId) {
  const newItemCount = plan.addItems.length + plan.addCategories.reduce((n, c) => n + c.items, 0);
  if (profile.categories.length + plan.addCategories.length > LIMITS.categories) return fail(`A profile can have up to ${LIMITS.categories} categories.`);
  if (profile.items.length + newItemCount > LIMITS.items) return fail(`A profile can have up to ${LIMITS.items} items.`);

  const freshId = idFactory(profile, makeId);
  const idError = fail('Could not make a new identifier. Try again.');
  // New categories follow the module: shown while it is on, hidden while it is hidden. An
  // adult-intended module whose note has not been read never gains a visible category (D-009).
  const moduleOn = mine.categories.some((c) => c.visibility === 'visible');
  const mayShow = moduleOn && !(template.adultIntended === true && profile.settings.restrictedModulesAcknowledged !== true);
  const visibility = mayShow ? 'visible' : 'hidden';

  const topOrder = profile.categories.filter((c) => c.parentId === null).reduce((m, c) => Math.max(m, c.sortOrder), 0);
  const categories = [];
  const items = [];
  const idFor = new Map(); // template category key -> profile category id

  for (const [index, spec] of plan.addCategories.entries()) {
    const source = template.categories.find((c) => c.key === spec.key);
    const categoryId = freshId('cat');
    if (categoryId === null) return idError;
    idFor.set(source.key, categoryId);
    categories.push({
      id: categoryId, name: source.name, description: source.description ?? '', parentId: null,
      sortOrder: topOrder + (index + 1) * 10, visibility, sensitivity: source.sensitivity, origin: originFor(template, source.key),
    });
    for (const [position, item] of source.items.entries()) {
      const itemId = freshId('item');
      if (itemId === null) return idError;
      items.push({
        id: itemId, categoryId, type: item.type ?? 'state', label: item.label, description: item.description ?? '',
        sortOrder: (position + 1) * 10, sensitivity: item.sensitivity ?? source.sensitivity, tags: [...(item.tags ?? [])], origin: originFor(template, item.key),
      });
    }
  }

  const lastOrder = new Map();
  for (const item of profile.items) lastOrder.set(item.categoryId, Math.max(lastOrder.get(item.categoryId) ?? 0, item.sortOrder));
  for (const spec of plan.addItems) {
    const source = template.categories.find((c) => c.items.some((i) => i.key === spec.key));
    const item = source.items.find((i) => i.key === spec.key);
    const category = mine.categoryByKey.get(source.key);
    const itemId = freshId('item');
    if (itemId === null) return idError;
    const sortOrder = (lastOrder.get(category.id) ?? 0) + 10;
    lastOrder.set(category.id, sortOrder);
    items.push({
      id: itemId, categoryId: category.id, type: item.type ?? 'state', label: item.label, description: item.description ?? '',
      sortOrder, sensitivity: item.sensitivity ?? source.sensitivity,
      tags: [...(item.tags ?? [])], origin: originFor(template, item.key),
    });
  }
  return { ok: true, categories, items };
}

function guard(profile, template) {
  if (!usable(template)) return { error: 'That module is not available.' };
  const plan = planModuleSync(profile, template);
  if (!plan.present) return { error: 'That module is not in this profile.' };
  if (plan.newerInProfile) return { error: 'This profile has a newer version of that module than this app knows. Update the app first.' };
  return { plan };
}

/** Raise the version recorded on every entry of the module that is below the template's. */
const stamp = (entry, template) => (entry.origin?.templateId === template.templateId && entry.origin.templateVersion < template.version
  ? { ...entry, origin: { ...entry.origin, templateVersion: template.version } }
  : entry);

/**
 * Add what a newer template has and the profile lacks, and record the new version. Wording the
 * person changed is kept as it is. Answers and notes are not touched.
 * @param {{ template: object, makeId?: (prefix: string) => string }} args
 * @returns {{ ok: true, profile: object, added: { categories: number, items: number } } | { ok: false, error: string }}
 */
export function updateModule(profile, { template, makeId = newId }, now) {
  const checked = guard(profile, template);
  if (checked.error) return fail(checked.error);
  const { plan } = checked;
  if (!plan.updateAvailable) return ok(profile, { added: { categories: 0, items: 0 } });

  const made = build(profile, template, plan, own(profile, template.templateId), makeId);
  if (!made.ok) return made;
  return ok({
    ...profile,
    categories: [...profile.categories.map((c) => stamp(c, template)), ...made.categories],
    items: [...profile.items.map((i) => stamp(i, template)), ...made.items],
    updatedAt: now,
  }, { added: { categories: made.categories.length, items: made.items.length } });
}

/**
 * Put a module back to its template: restore the template's wording and order, bring back anything
 * missing, and record the current version. What the person added stays. Entries the template no
 * longer has stay. Answers, notes, visibility and an item's type are not touched, and a sensitivity
 * level is never lowered (D-032).
 * @param {{ template: object, makeId?: (prefix: string) => string }} args
 * @returns {{ ok: true, profile: object, added: { categories: number, items: number }, restored: number } | { ok: false, error: string }}
 */
export function resetModule(profile, { template, makeId = newId }, now) {
  const checked = guard(profile, template);
  if (checked.error) return fail(checked.error);
  const { plan } = checked;
  const mine = own(profile, template.templateId);
  const made = build(profile, template, plan, mine, makeId);
  if (!made.ok) return made;

  const specCategory = new Map(template.categories.map((c) => [c.key, c]));
  const specItem = new Map(template.categories.flatMap((c) => c.items.map((i) => [i.key, i])));
  const categoryPosition = new Map(template.categories.map((c, index) => [c.key, index]));
  const itemPosition = new Map(template.categories.flatMap((c) => c.items.map((i, index) => [i.key, index])));
  let restored = 0;

  const restoreCategory = (c) => {
    if (c.origin?.templateId !== template.templateId) return c;
    const spec = specCategory.get(c.origin.key);
    if (!spec) return stamp(c, template);
    const next = { ...stamp(c, template), name: spec.name, description: spec.description ?? '', sensitivity: higher(c.sensitivity, spec.sensitivity) };
    if (next.name !== c.name || next.description !== c.description) restored += 1;
    return next;
  };
  const restoreItem = (i) => {
    if (i.origin?.templateId !== template.templateId) return i;
    const spec = specItem.get(i.origin.key);
    if (!spec) return stamp(i, template);
    const next = {
      ...stamp(i, template), label: spec.label, description: spec.description ?? '', tags: [...(spec.tags ?? [])],
      sensitivity: higher(i.sensitivity, spec.sensitivity ?? 'normal'),
    };
    if (next.label !== i.label || next.description !== i.description || !sameTags(next.tags, i.tags)) restored += 1;
    return next;
  };

  let categories = [...profile.categories.map(restoreCategory), ...made.categories];
  let items = [...profile.items.map(restoreItem), ...made.items];

  // Order. The module's categories take the template's order among themselves, reusing the same
  // sort values they already hold, so nothing moves relative to the person's own categories.
  const moduleCategories = categories.filter((c) => c.origin?.templateId === template.templateId);
  const groups = new Map();
  for (const c of moduleCategories) groups.set(c.parentId, [...(groups.get(c.parentId) ?? []), c]);
  const newOrder = new Map();
  for (const group of groups.values()) {
    const slots = group.map((c) => c.sortOrder).sort((a, b) => a - b);
    const inTemplateOrder = [...group].sort((a, b) => (categoryPosition.get(a.origin.key) ?? Infinity) - (categoryPosition.get(b.origin.key) ?? Infinity) || a.sortOrder - b.sortOrder);
    inTemplateOrder.forEach((c, index) => newOrder.set(c.id, slots[index]));
  }
  categories = categories.map((c) => (newOrder.has(c.id) ? { ...c, sortOrder: newOrder.get(c.id) } : c));

  // Items in the module's categories: template items first in template order, then everything else
  // in the order it had, renumbered 10, 20, 30 so tied values never hide a move (D-031).
  const moduleCategoryIds = new Set(moduleCategories.map((c) => c.id));
  const itemOrder = new Map();
  for (const categoryId of moduleCategoryIds) {
    const inCategory = items.filter((i) => i.categoryId === categoryId);
    const isTemplate = (i) => i.origin?.templateId === template.templateId && itemPosition.has(i.origin.key);
    const sorted = [...inCategory].sort((a, b) => {
      if (isTemplate(a) !== isTemplate(b)) return isTemplate(a) ? -1 : 1;
      if (isTemplate(a)) return itemPosition.get(a.origin.key) - itemPosition.get(b.origin.key);
      return a.sortOrder - b.sortOrder;
    });
    sorted.forEach((i, index) => itemOrder.set(i.id, (index + 1) * 10));
  }
  items = items.map((i) => (itemOrder.has(i.id) ? { ...i, sortOrder: itemOrder.get(i.id) } : i));

  return ok({ ...profile, categories, items, updatedAt: now }, { added: { categories: made.categories.length, items: made.items.length }, restored });
}
