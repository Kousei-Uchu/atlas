// Click behaviour commands (spec 6.1, 8; D-003, D-004; M2-09). Pure, same contract as
// commands.js (I-05): (profile, args, now) -> { ok, profile } or { ok: false, error }.
//
// These two settings belong to the profile, so they travel with a backup and can be undone.
// Neither one touches an answer (I-03): they only decide what the next click does.
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
