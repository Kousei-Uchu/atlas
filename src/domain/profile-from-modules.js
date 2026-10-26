// Start a new profile from chosen modules (M3-06). Pure. It builds a profile ready to be stored
// as NEW (I-12). It adds definitions only: no answer is ever made (I-01), and no age is asked for.
import { LIMITS } from './limits.js';
import { newId } from './ids.js';
import { createBlankProfile } from './defaults.js';
import { addModule } from './module-commands.js';

const fail = (error) => ({ ok: false, error });

/**
 * @param {{ id: string, title: string, templates: object[], acknowledgeAdult?: boolean, makeId?: (prefix: string) => string }} args
 * @param {string} now
 * @returns {{ ok: true, profile: object } | { ok: false, error: string }}
 */
export function buildProfileFromModules({ id, title, templates, acknowledgeAdult = false, makeId = newId }, now) {
  const name = typeof title === 'string' ? title.trim() : '';
  if (name === '') return fail('A profile needs a name.');
  if (name.length > LIMITS.titleLength) return fail(`A profile name must be ${LIMITS.titleLength} characters or fewer.`);
  if (!Array.isArray(templates) || templates.length === 0) return fail('Choose at least one module.');
  const ids = templates.map((t) => t?.templateId);
  if (new Set(ids).size !== ids.length) return fail('Each module can be chosen only once.');

  // The person chose each module, so each starts shown. A module for adults needs the note first (D-009).
  let profile = createBlankProfile({ id, now, title: name });
  for (const template of templates) {
    const result = addModule(profile, { template, visibility: 'visible', acknowledgeAdult, makeId }, now);
    if (!result.ok) return fail(result.error);
    profile = result.profile;
  }
  return { ok: true, profile };
}
