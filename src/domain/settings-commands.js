// Click behaviour commands (spec 6.1, 8; D-003, D-004; M2-09). Pure, same contract as
// commands.js (I-05): (profile, args, now) -> { ok, profile } or { ok: false, error }.
//
// These two settings belong to the profile, so they travel with a backup and can be undone.
// Neither one touches an answer (I-03): they only decide what the next click does.
import { wordingOf } from './templates.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });

/** What happens when a click goes past the last state. */
export const END_BEHAVIOURS = Object.freeze(['clamp', 'loop']);

/** Which end of the cycle a primary click moves toward. */
export const PRIMARY_DIRECTIONS = Object.freeze(['negative', 'positive']);

/**
 * Stop at the ends of the cycle (`clamp`) or go around (`loop`).
 * @param {{ endBehaviour: 'clamp'|'loop' }} args
 */
export function setEndBehaviour(profile, { endBehaviour }, now) {
  if (!END_BEHAVIOURS.includes(endBehaviour)) return fail('End behaviour must be stop or go around.');
  if (profile.settings.cycle.endBehaviour === endBehaviour) return ok(profile);
  const settings = { ...profile.settings, cycle: { ...profile.settings.cycle, endBehaviour } };
  return ok({ ...profile, settings, updatedAt: now });
}

/**
 * Choose which way a primary click moves. A secondary click always moves the other way.
 * @param {{ primaryDirection: 'negative'|'positive' }} args
 */
export function setPrimaryDirection(profile, { primaryDirection }, now) {
  if (!PRIMARY_DIRECTIONS.includes(primaryDirection)) return fail('Direction must be toward the negative or the positive end.');
  if (profile.settings.interaction.primaryDirection === primaryDirection) return ok(profile);
  const settings = { ...profile.settings, interaction: { ...profile.settings.interaction, primaryDirection } };
  return ok({ ...profile, settings, updatedAt: now });
}

const NEEDS_NOTE = 'Read the note about mature phrasing before turning it on.';

/**
 * Turn mature phrasing on or off for this profile (D-043). Turning it on needs `acknowledge: true`,
 * so the note is enforced in the command and not only on the screen, as for adult modules (D-009).
 *
 * Switching rewrites the wording of module entries, and only an entry whose wording is still the
 * template's wording in the other phrasing. A label or description the person changed is kept, and
 * so is anything they added. Each field is judged on its own. Answers, notes, order, visibility and
 * sensitivity are never touched (I-01, I-03). `templates` are the validated templates to read
 * wording from; an entry from a template that is not in the list is left alone.
 * @param {{ enabled: boolean, acknowledge?: boolean, templates: object[] }} args
 * @returns {{ ok: true, profile: object, changed: number } | { ok: false, error: string }}
 */
export function setMaturePhrasing(profile, { enabled, acknowledge = false, templates }, now) {
  if (typeof enabled !== 'boolean') return fail('Mature phrasing must be on or off.');
  if (!Array.isArray(templates)) return fail('That module is not available.');
  const current = profile.settings.maturePhrasing === true;
  if (current === enabled) return ok(profile, { changed: 0 });
  if (enabled && acknowledge !== true) return fail(NEEDS_NOTE);

  const byId = new Map(templates.map((t) => [t.templateId, t]));
  const specs = (kind, entry) => {
    const template = byId.get(entry.origin?.templateId);
    if (!template) return null;
    for (const category of template.categories) {
      if (kind === 'category' && category.key === entry.origin.key) return category;
      if (kind === 'item') { const item = category.items.find((i) => i.key === entry.origin.key); if (item) return item; }
    }
    return null;
  };
  // [from, to]: what the entry says now if untouched, and what it should say after the switch.
  const pick = (spec) => {
    const plain = wordingOf(spec, false);
    const mature = wordingOf(spec, true);
    return enabled ? { from: plain, to: mature } : { from: mature, to: plain };
  };

  let changed = 0;
  const swap = (entry, spec, textField) => {
    const { from, to } = pick(spec);
    const next = { ...entry };
    if (entry[textField] === from.text && from.text !== to.text) next[textField] = to.text;
    if (entry.description === from.description && from.description !== to.description) next.description = to.description;
    if (next[textField] !== entry[textField] || next.description !== entry.description) changed += 1;
    return next;
  };

  const categories = profile.categories.map((c) => { const spec = specs('category', c); return spec?.mature ? swap(c, spec, 'name') : c; });
  const items = profile.items.map((i) => { const spec = specs('item', i); return spec?.mature ? swap(i, spec, 'label') : i; });
  const settings = { ...profile.settings, maturePhrasing: enabled };
  return ok({ ...profile, settings, categories, items, updatedAt: now }, { changed });
}
