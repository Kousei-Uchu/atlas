// Modules (M3-04): a template added to a profile. Pure, same contract as commands.js (I-05).
// The caller passes the validated template, so the domain never reaches into bundled content.
//
// Adding a module only adds definitions. It never creates or changes an answer (I-01, I-03), and
// hiding a module keeps every answer in it. Resetting and updating a module is M3-06.
import { LIMITS } from './limits.js';
import { isValidId, newId } from './ids.js';
import { originFor } from './templates.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });
const VISIBILITIES = ['visible', 'hidden'];

const inModule = (profile, templateId) => profile.categories.filter((c) => c.origin?.templateId === templateId);

function usable(template) {
  return template !== null && typeof template === 'object' && typeof template.templateId === 'string' && Array.isArray(template.categories);
}

/**
 * Where a module stands in a profile.
 * `on` means at least one of its categories is showing. `hidden` means it is present but none is.
 * @returns {{ state: 'absent'|'on'|'hidden', categories: number, items: number }}
 */
export function moduleStatus(profile, templateId) {
  const categories = inModule(profile, templateId);
  if (categories.length === 0) return { state: 'absent', categories: 0, items: 0 };
  const ids = new Set(categories.map((c) => c.id));
  return {
    state: categories.some((c) => c.visibility === 'visible') ? 'on' : 'hidden',
    categories: categories.length,
    items: profile.items.filter((i) => ids.has(i.categoryId)).length,
  };
}

/**
 * A function that makes identifiers no category or item in the profile already uses.
 * Returns null after a few failed tries, so a broken generator cannot loop for ever.
 * @param {{ categories: Array<{id: string}>, items: Array<{id: string}> }} profile
 * @param {(prefix: string) => string} makeId
 */
export function idFactory(profile, makeId) {
  const taken = new Set([...profile.categories.map((c) => c.id), ...profile.items.map((i) => i.id)]);
  return (prefix) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = makeId(prefix);
      if (isValidId(id) && !taken.has(id)) { taken.add(id); return id; }
    }
    return null;
  };
}

const needsNote = (template, visibility, acknowledgeAdult) =>
  template.adultIntended === true && visibility === 'visible' && acknowledgeAdult !== true;

const NOTE_ERROR = 'Read the note for adults before turning this module on.';

function acknowledged(profile, template, visibility) {
  if (!(template.adultIntended === true && visibility === 'visible')) return profile.settings;
  if (profile.settings.restrictedModulesAcknowledged === true) return profile.settings;
  return { ...profile.settings, restrictedModulesAcknowledged: true };
}

/**
 * Add a template's categories and items to the profile. A module that is already there is not
 * added twice. Turning on an adult-intended module needs `acknowledgeAdult: true` (D-009).
 * @param {{ template: object, visibility?: 'visible'|'hidden', acknowledgeAdult?: boolean, makeId?: (prefix: string) => string }} args
 */
export function addModule(profile, { template, visibility, acknowledgeAdult = false, makeId = newId }, now) {
  if (!usable(template)) return fail('That module is not available.');
  const show = visibility ?? template.defaultVisibility;
  if (!VISIBILITIES.includes(show)) return fail('Visibility must be visible or hidden.');
  if (inModule(profile, template.templateId).length > 0) return fail('That module is already in this profile.');
  if (needsNote(template, show, acknowledgeAdult)) return fail(NOTE_ERROR);

  const newItems = template.categories.reduce((n, c) => n + c.items.length, 0);
  if (profile.categories.length + template.categories.length > LIMITS.categories) return fail(`A profile can have up to ${LIMITS.categories} categories.`);
  if (profile.items.length + newItems > LIMITS.items) return fail(`A profile can have up to ${LIMITS.items} items.`);

  const freshId = idFactory(profile, makeId);

  const top = profile.categories.filter((c) => c.parentId === null).reduce((m, c) => Math.max(m, c.sortOrder), 0);
  const categories = [];
  const items = [];
  for (const [index, category] of template.categories.entries()) {
    const categoryId = freshId('cat');
    if (categoryId === null) return fail('Could not make a new identifier. Try again.');
    categories.push({
      id: categoryId, name: category.name, description: category.description ?? '', parentId: null,
      sortOrder: top + (index + 1) * 10, visibility: show, sensitivity: category.sensitivity,
      origin: originFor(template, category.key),
    });
    for (const [position, item] of category.items.entries()) {
      const itemId = freshId('item');
      if (itemId === null) return fail('Could not make a new identifier. Try again.');
      items.push({
        id: itemId, categoryId, type: item.type ?? 'state', label: item.label, description: item.description ?? '',
        sortOrder: (position + 1) * 10, sensitivity: item.sensitivity ?? category.sensitivity,
        tags: [...(item.tags ?? [])], origin: originFor(template, item.key),
      });
    }
  }

  const templateIds = profile.metadata.templateIds.includes(template.templateId)
    ? profile.metadata.templateIds
    : [...profile.metadata.templateIds, template.templateId];
  return ok({
    ...profile,
    settings: acknowledged(profile, template, show),
    categories: [...profile.categories, ...categories],
    items: [...profile.items, ...items],
    metadata: { ...profile.metadata, templateIds },
    updatedAt: now,
  }, { categoryIds: categories.map((c) => c.id) });
}

/**
 * Show or hide every category of a module that is already in the profile. Hiding keeps all
 * answers. Showing an adult-intended module needs `acknowledgeAdult: true` (D-009).
 * @param {{ template: object, visibility: 'visible'|'hidden', acknowledgeAdult?: boolean }} args
 */
export function setModuleVisibility(profile, { template, visibility, acknowledgeAdult = false }, now) {
  if (!usable(template)) return fail('That module is not available.');
  if (!VISIBILITIES.includes(visibility)) return fail('Visibility must be visible or hidden.');
  const own = inModule(profile, template.templateId);
  if (own.length === 0) return fail('That module is not in this profile.');
  if (own.every((c) => c.visibility === visibility)) return ok(profile);
  if (needsNote(template, visibility, acknowledgeAdult)) return fail(NOTE_ERROR);

  const ids = new Set(own.map((c) => c.id));
  return ok({
    ...profile,
    settings: acknowledged(profile, template, visibility),
    categories: profile.categories.map((c) => (ids.has(c.id) ? { ...c, visibility } : c)),
    updatedAt: now,
  });
}
