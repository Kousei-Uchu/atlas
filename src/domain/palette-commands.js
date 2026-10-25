// Palette commands (spec 5.2, 6; M2). Same contract as commands.js:
// (profile, args, now) -> { ok, profile } | { ok: false, error }, pure, no mutation (I-05).
//
// Answers and overrides refer to states by stable ID, so renaming or recolouring a state
// never touches an answer (I-03). Removing a state is the only command here that edits
// answers, and it does so only through an explicit reassign-or-clear choice.
import { LIMITS } from './limits.js';
import { isValidId } from './ids.js';
import { STATE_ICONS, STATE_PATTERNS, STATE_SEMANTICS } from './schema.js';
import { getCycle } from './state-cycle.js';
import { stateUsage } from './selectors.js';

const ok = (profile, extra = {}) => ({ ok: true, profile, ...extra });
const fail = (error) => ({ ok: false, error });
const touch = (profile, now) => ({ ...profile, updatedAt: now });

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * How permissive each meaning is. Used only to stop a removal from silently turning a
 * stored answer into a more permissive one (see `removeState`). Never used for ordering.
 */
const PERMISSIVENESS = {
  negative: 0,
  uncertain: 1,
  neutral: 1,
  'not-applicable': 1,
  conditional: 2,
  positive: 3,
};

const isAllowedReplacement = (removed, candidate) => PERMISSIVENESS[candidate.semantic] <= PERMISSIVENESS[removed.semantic];

/**
 * The states that answers could be moved to if `id` were removed: selectable, not
 * Unanswered, not the state itself, and not more permissive than it.
 */
export function removalReplacements(profile, id) {
  const removed = profile.states.find((s) => s.id === id);
  if (!removed) return [];
  return profile.states.filter((s) => s.id !== id && s.isSelectable && !s.isUnanswered && isAllowedReplacement(removed, s));
}

function checkLabel(profile, label, exceptId) {
  const text = typeof label === 'string' ? label.trim() : '';
  if (text === '') return { error: 'A state needs a name.' };
  if (text.length > LIMITS.stateLabelLength) return { error: `A state name must be ${LIMITS.stateLabelLength} characters or fewer.` };
  const clash = profile.states.find((s) => s.id !== exceptId && s.label.trim().toLowerCase() === text.toLowerCase());
  // Two states with the same text would be told apart by colour alone (I-09).
  if (clash) return { error: `Another state is already called “${clash.label}”. Use a different name so they can be told apart without colour.` };
  return { text };
}

function checkColour(value, what) {
  if (typeof value !== 'string' || !HEX.test(value)) return { error: `${what} must be a colour like #1B5E20.` };
  return { colour: value.toUpperCase() };
}

/** Validate the editable fields shared by update and add. Returns the cleaned fields or an error. */
function cleanFields(profile, fields, exceptId) {
  const out = {};
  if ('label' in fields) {
    const r = checkLabel(profile, fields.label, exceptId);
    if (r.error) return r;
    out.label = r.text;
  }
  if ('description' in fields) {
    if (typeof fields.description !== 'string' || fields.description.length > LIMITS.stateDescriptionLength) {
      return { error: `A description must be ${LIMITS.stateDescriptionLength} characters or fewer.` };
    }
    out.description = fields.description;
  }
  for (const [key, what] of [['color', 'Background colour'], ['textColor', 'Text colour']]) {
    if (key in fields) {
      const r = checkColour(fields[key], what);
      if (r.error) return r;
      out[key] = r.colour;
    }
  }
  if ('icon' in fields) {
    if (!STATE_ICONS.includes(fields.icon)) return { error: 'Choose one of the listed icons.' };
    out.icon = fields.icon;
  }
  if ('pattern' in fields) {
    if (!STATE_PATTERNS.includes(fields.pattern)) return { error: 'Choose one of the listed patterns.' };
    out.pattern = fields.pattern;
  }
  if ('semantic' in fields) {
    if (!STATE_SEMANTICS.includes(fields.semantic)) return { error: 'Choose one of the listed meanings.' };
    out.semantic = fields.semantic;
  }
  return { fields: out };
}

/**
 * Change how a state looks and what it is called. Answers are untouched (I-03).
 * The Unanswered state can be renamed and restyled, but its meaning is fixed.
 * @param {{ id: string, changes: Partial<{ label: string, description: string, color: string, textColor: string, icon: string, pattern: string, semantic: string }> }} args
 */
export function updateState(profile, { id, changes }, now) {
  const state = profile.states.find((s) => s.id === id);
  if (!state) return fail('That state no longer exists.');
  if (changes === null || typeof changes !== 'object') return fail('There is nothing to change.');
  const allowed = ['label', 'description', 'color', 'textColor', 'icon', 'pattern', 'semantic'];
  const unknown = Object.keys(changes).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) return fail(`These settings cannot be changed here: ${unknown.join(', ')}.`);
  if ('semantic' in changes && state.isSystem && changes.semantic !== state.semantic) {
    return fail('The meaning of this built-in state is fixed.');
  }
  const cleaned = cleanFields(profile, changes, id);
  if (cleaned.error) return fail(cleaned.error);
  const next = { ...state, ...cleaned.fields };
  if (Object.keys(cleaned.fields).every((k) => state[k] === next[k])) return ok(profile);
  return ok(touch({ ...profile, states: profile.states.map((s) => (s.id === id ? next : s)) }, now));
}

/**
 * Add a state. New states start as picker-only (outside the click cycle) unless
 * `inCycle` is true, in which case they join at the end. Nothing is ever added as a
 * default answer for any item (I-01).
 * @param {{ id: string, label: string, semantic: string, color?: string, textColor?: string,
 *   icon?: string, pattern?: string, description?: string, inCycle?: boolean }} args
 */
export function addState(profile, args, now) {
  const { id, inCycle = false } = args;
  if (!isValidId(id) || profile.states.some((s) => s.id === id)) return fail('That state id is not available.');
  if (profile.states.length >= LIMITS.states) return fail(`A profile can have up to ${LIMITS.states} states.`);
  const fields = {
    description: '', color: '#D9D9D9', textColor: '#1F1F1F', icon: 'dot', pattern: 'solid', semantic: 'neutral',
    ...Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'id' && k !== 'inCycle' && args[k] !== undefined)),
  };
  const cleaned = cleanFields(profile, fields, null);
  if (cleaned.error) return fail(cleaned.error);
  const cycle = getCycle([...profile.states]);
  const cycleOrder = inCycle === true ? (cycle.at(-1)?.cycleOrder ?? 0) + 10 : null;
  const state = {
    id, ...cleaned.fields, cycleOrder, isUnanswered: false, isSystem: false, isSelectable: true,
  };
  return ok(touch({ ...profile, states: [...profile.states, state] }, now));
}

/**
 * Put a state into the click cycle (at the end) or take it out (picker only).
 * Unanswered always stays in the cycle (D-006).
 */
export function setStateInCycle(profile, { id, inCycle }, now) {
  const state = profile.states.find((s) => s.id === id);
  if (!state) return fail('That state no longer exists.');
  if (typeof inCycle !== 'boolean') return fail('Choose whether the state is in the cycle.');
  if (state.isUnanswered && !inCycle) return fail('Unanswered must stay in the cycle so a click always moves exactly one step.');
  const already = state.cycleOrder !== null;
  if (already === inCycle) return ok(profile);
  const cycle = getCycle([...profile.states]);
  const cycleOrder = inCycle ? (cycle.at(-1)?.cycleOrder ?? 0) + 10 : null;
  return ok(touch({ ...profile, states: profile.states.map((s) => (s.id === id ? { ...s, cycleOrder } : s)) }, now));
}

/**
 * Move a state one place along the cycle by swapping positions with its neighbour.
 * `earlier` is toward the start of the list (the negative end by default).
 * @param {{ id: string, direction: 'earlier'|'later' }} args
 */
export function moveStateInCycle(profile, { id, direction }, now) {
  if (direction !== 'earlier' && direction !== 'later') return fail('Direction must be earlier or later.');
  const cycle = getCycle([...profile.states]);
  const index = cycle.findIndex((s) => s.id === id);
  if (index === -1) return fail(profile.states.some((s) => s.id === id) ? 'That state is not in the cycle.' : 'That state no longer exists.');
  const target = index + (direction === 'earlier' ? -1 : 1);
  if (target < 0 || target >= cycle.length) return ok(profile, { moved: false });
  const a = cycle[index];
  const b = cycle[target];
  const states = profile.states.map((s) => {
    if (s.id === a.id) return { ...s, cycleOrder: b.cycleOrder };
    if (s.id === b.id) return { ...s, cycleOrder: a.cycleOrder };
    return s;
  });
  return ok(touch({ ...profile, states }, now), { moved: true });
}

/**
 * Remove a state, with an explicit choice for answers that use it.
 *
 * - `replacementId: null` clears them: those items become Unanswered, and a note on an
 *   answer is kept (D-012).
 * - `replacementId: '<state id>'` moves them to another state. It is refused when the
 *   new state is more permissive than the removed one, so removing a state can never
 *   quietly turn a stored No or Unsure into a Yes or Conditional (I-01, I-02).
 * - Overrides that use the state follow the same choice; cleared overrides are deleted.
 * - The system Unanswered state cannot be removed.
 * @param {{ id: string, replacementId: string|null }} args
 */
export function removeState(profile, { id, replacementId = null }, now) {
  const state = profile.states.find((s) => s.id === id);
  if (!state) return fail('That state no longer exists.');
  if (state.isSystem || state.isUnanswered) return fail('Built-in states cannot be removed.');
  const usage = stateUsage(profile, id);
  const inUse = usage.answers + usage.overrides > 0;

  let replacement = null;
  if (replacementId !== null && replacementId !== undefined) {
    if (replacementId === id) return fail('Choose a different state to move them to.');
    replacement = profile.states.find((s) => s.id === replacementId);
    if (!replacement || replacement.isUnanswered || !replacement.isSelectable) return fail('Choose a state that answers can use, or clear them.');
    if (inUse && !isAllowedReplacement(state, replacement)) {
      return fail(`“${replacement.label}” is more permissive than “${state.label}”. Choose a state that is not more permissive, or clear the answers.`);
    }
  }

  const answers = [];
  for (const a of profile.answers) {
    if (a.stateId !== id) { answers.push(a); continue; }
    if (replacement) { answers.push({ ...a, stateId: replacement.id }); continue; }
    // Keep the answer only if it still has text or a note once the state is gone (D-012).
    const kept = { itemId: a.itemId, noteShareable: Boolean(a.note) && a.noteShareable === true };
    if (a.text) kept.text = a.text;
    if (a.note) kept.note = a.note;
    if (kept.text || kept.note) answers.push(kept);
  }
  const overrides = profile.overrides.flatMap((o) => {
    if (o.stateId !== id) return [o];
    return replacement ? [{ ...o, stateId: replacement.id }] : [];
  });
  const next = { ...profile, states: profile.states.filter((s) => s.id !== id), answers, overrides };
  return ok(touch(next, now), { affectedAnswers: usage.answers, affectedOverrides: usage.overrides });
}
