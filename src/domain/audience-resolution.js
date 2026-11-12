// What an audience sees for each item (spec 7; I-01, I-04, I-05, D-013; M4-02).
//
//   1. An enabled override for (item, audience) wins.
//   2. Otherwise the nearest parent audience with an enabled override for the item is inherited,
//      but only when it is no more open than the item's own answer (inheritance can narrow, never
//      widen; D-073). Two disagreeing overrides at that parent inherit as Unanswered.
//   3. Otherwise the item's own answer is used.
//   4. Otherwise Unanswered.
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
 * @property {'override'|'inherited'|'answer'|'unanswered'|'conflict'} source
 * @property {string|null} overrideId   The override that decided it, when there is one.
 * @property {string} explanation       The person's own reason, if they wrote one.
 * @property {string[]} conflictOverrideIds  Enabled overrides that disagree, when source is 'conflict'.
 * @property {string|null} inheritedFromId   The ancestor audience whose override was inherited, when source is 'inherited'.
 * @property {{ audienceId: string, stateId: string }|null} heldBack  A parent override that was not applied because it would show more than the item's own answer.
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

/** Ancestors of an audience, nearest first. Stops on a loop or a missing parent, so bad data cannot hang. */
export function ancestorsOf(profile, audienceId) {
  const byId = new Map(profile.audiences.map((a) => [a.id, a]));
  const seen = new Set([audienceId]);
  const chain = [];
  let cursor = byId.get(audienceId);
  while (cursor && cursor.parentId && !seen.has(cursor.parentId) && byId.has(cursor.parentId)) {
    seen.add(cursor.parentId);
    chain.push(cursor.parentId);
    cursor = byId.get(cursor.parentId);
  }
  return chain;
}

/** Nothing direct applies: look at the nearest parent that says something about this item. */
function inherit(profile, base, enabledByPair) {
  for (const parentId of ancestorsOf(profile, base.audienceId)) {
    const found = enabledByPair.get(pairKey(base.itemId, parentId)) ?? [];
    if (found.length === 0) continue;
    const decided = [...found].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    const disagree = new Set(found.map((o) => o.stateId)).size > 1;
    const stateId = disagree || !getState(profile, decided.stateId) ? UNANSWERED_ID : decided.stateId;
    if (stateId !== UNANSWERED_ID && stateId !== base.defaultStateId && open(profile, base.defaultStateId, stateId)) {
      return { ...base, heldBack: { audienceId: parentId, stateId } };
    }
    return {
      ...base, stateId, source: 'inherited', inheritedFromId: parentId, overrideId: disagree ? null : decided.id,
      explanation: disagree ? '' : decided.explanation,
      differs: stateId !== base.defaultStateId, moreOpenThanDefault: false,
    };
  }
  return base;
}

function resolveWith(profile, itemId, audienceId, enabledByPair) {
  const defaultStateId = effectiveStateId(profile, itemId);
  const base = {
    itemId, audienceId, defaultStateId, stateId: defaultStateId,
    source: defaultStateId === UNANSWERED_ID ? 'unanswered' : 'answer',
    overrideId: null, explanation: '', conflictOverrideIds: [], inheritedFromId: null, heldBack: null,
    differs: false, moreOpenThanDefault: false,
  };
  if (audienceId === null) return base;

  const found = enabledByPair.get(pairKey(itemId, audienceId)) ?? [];
  if (found.length === 0) return inherit(profile, base, enabledByPair);

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
    case 'inherited': {
      const parent = profile.audiences.find((a) => a.id === resolution.inheritedFromId)?.name ?? 'a parent audience';
      const why = resolution.explanation ? ` Their reason: ${resolution.explanation}` : '';
      if (resolution.overrideId === null) return `${audience ?? 'This audience'} sees ${shown}, because ${parent} has overrides that disagree for this item. Keep one on ${parent} to settle it.`;
      return `${audience ?? 'This audience'} sees ${shown}, inherited from ${parent}. Your own answer is ${base}.${why}`;
    }
    case 'answer': {
      const held = resolution.heldBack;
      if (held) {
        const from = profile.audiences.find((a) => a.id === held.audienceId)?.name ?? 'a parent audience';
        return `${audience ?? 'Everyone'} sees ${shown}, which is your own answer. ${from} shows ${label(held.stateId)}, but that is more open than your own answer, so it is not passed down. Override this audience directly to show it.`;
      }
      return `${audience ?? 'Everyone'} sees ${shown}, which is your own answer. No override applies.`;
    }
    default:
      return `${audience ?? 'Everyone'} sees ${shown}. Nothing is answered for this item, and an empty answer is never a yes.`;
  }
}
