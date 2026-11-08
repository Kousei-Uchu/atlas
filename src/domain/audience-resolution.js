// What an audience sees for each item (spec 7; I-01, I-04, I-05, D-013; M4-02).
//
//   1. An enabled override for (item, audience) wins.
//   2. Otherwise the item's own answer is used.
//   3. Otherwise Unanswered.
//
// Every result says why it is what it is, so the screen can always explain it. Two enabled
// overrides that disagree are a conflict: nothing is chosen on the person's behalf, the value
// falls to Unanswered, and `source` is 'conflict' so a consumer can refuse to export (D-013).
// Nothing here reads colour or wording to decide (I-03) and nothing is changed (I-05).
import { UNANSWERED_ID } from './defaults.js';
import { effectiveStateId, getState } from './selectors.js';
import { permissivenessOf } from './palette-commands.js';

/**
 * @typedef {object} Resolution
 * @property {string} itemId
 * @property {string|null} audienceId
 * @property {string} defaultStateId    The item's own answer, or Unanswered.
 * @property {string} stateId           What the audience sees.
 * @property {'override'|'answer'|'unanswered'|'conflict'} source
 * @property {string|null} overrideId   The override that decided it, when there is one.
 * @property {string} explanation       The person's own reason, if they wrote one.
 * @property {string[]} conflictOverrideIds  Enabled overrides that disagree, when source is 'conflict'.
 * @property {boolean} differs          Whether the audience sees something other than the default.
 * @property {boolean} moreOpenThanDefault  Whether the audience sees a more permissive state than the default.
 */

const pairKey = (itemId, audienceId) => `${audienceId}\u0000${itemId}`;

/** Enabled overrides indexed by audience and item, for resolving many items at once. */
function indexEnabled(profile) {
  const index = new Map();
  for (const o of profile.overrides) {
    if (!o.enabled) continue;
    const key = pairKey(o.itemId, o.audienceId);
    const list = index.get(key);
    if (list) list.push(o);
    else index.set(key, [o]);
  }
  return index;
}

function open(profile, defaultStateId, stateId) {
  if (stateId === defaultStateId) return false;
  const shown = getState(profile, stateId);
  const base = getState(profile, defaultStateId);
  if (!shown || !base) return false;
  return permissivenessOf(shown) > permissivenessOf(base);
}

function resolveWith(profile, itemId, audienceId, enabledByPair) {
  const defaultStateId = effectiveStateId(profile, itemId);
  const base = {
    itemId, audienceId, defaultStateId, stateId: defaultStateId,
    source: defaultStateId === UNANSWERED_ID ? 'unanswered' : 'answer',
    overrideId: null, explanation: '', conflictOverrideIds: [], differs: false, moreOpenThanDefault: false,
  };
  if (audienceId === null) return base;

  const found = enabledByPair.get(pairKey(itemId, audienceId)) ?? [];
  if (found.length === 0) return base;

  const ids = found.map((o) => o.id).sort();
  if (found.length > 1 && new Set(found.map((o) => o.stateId)).size > 1) {
    return {
      ...base, stateId: UNANSWERED_ID, source: 'conflict', conflictOverrideIds: ids,
      differs: defaultStateId !== UNANSWERED_ID, moreOpenThanDefault: false,
    };
  }
  // Identical duplicates agree, so the first by id decides and nothing is lost.
  const decided = [...found].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  // An override that points at a missing state falls to Unanswered, never to something open (I-01).
  const stateId = getState(profile, decided.stateId) ? decided.stateId : UNANSWERED_ID;
  return {
    ...base, stateId, source: 'override', overrideId: decided.id, explanation: decided.explanation,
    differs: stateId !== defaultStateId, moreOpenThanDefault: open(profile, defaultStateId, stateId),
  };
}

/**
 * What one audience sees for one item. Pass `null` for the audience to get the default.
 * @returns {Resolution}
 */
export function resolveItem(profile, itemId, audienceId) {
  return resolveWith(profile, itemId, audienceId, indexEnabled(profile));
}

/**
 * What one audience sees for every item that takes a state, in item order.
 * @returns {Resolution[]}
 */
export function resolveAll(profile, audienceId) {
  const index = indexEnabled(profile);
  return profile.items.filter((i) => i.type === 'state').map((i) => resolveWith(profile, i.id, audienceId, index));
}

/**
 * Every item and audience with two or more enabled overrides that disagree, in a stable order.
 * @returns {{ itemId: string, audienceId: string, overrideIds: string[], stateIds: string[] }[]}
 */
export function listConflicts(profile) {
  const found = [];
  for (const list of indexEnabled(profile).values()) {
    if (list.length < 2 || new Set(list.map((o) => o.stateId)).size < 2) continue;
    found.push({
      itemId: list[0].itemId, audienceId: list[0].audienceId,
      overrideIds: list.map((o) => o.id).sort(), stateIds: [...new Set(list.map((o) => o.stateId))].sort(),
    });
  }
  return found.sort((a, b) => (a.audienceId + a.itemId < b.audienceId + b.itemId ? -1 : 1));
}

/** One resolution in plain words, for the screen and for screen readers. */
export function explainResolution(profile, resolution) {
  const label = (id) => getState(profile, id)?.label ?? 'an unknown state';
  const audience = profile.audiences.find((a) => a.id === resolution.audienceId)?.name ?? null;
  const shown = label(resolution.stateId);
  const base = label(resolution.defaultStateId);
  switch (resolution.source) {
    case 'conflict':
      return `${audience ?? 'This audience'} has ${resolution.conflictOverrideIds.length} overrides that disagree for this item, so nothing is shown until you keep one. Your own answer is ${base}.`;
    case 'override': {
      const why = resolution.explanation ? ` Your reason: ${resolution.explanation}` : '';
      const same = resolution.differs ? `Your own answer is ${base}.` : `This matches your own answer.`;
      return `${audience ?? 'This audience'} sees ${shown} because of an override. ${same}${why}`;
    }
    case 'answer':
      return `${audience ?? 'Everyone'} sees ${shown}, which is your own answer. No override applies.`;
    default:
      return `${audience ?? 'Everyone'} sees ${shown}. Nothing is answered for this item, and an empty answer is never a yes.`;
  }
}
