// The inclusion rule for a view (spec 5.6; I-01, I-04, I-05, I-11, D-013; M4-04). Pure.
//
// A view is an allowlist. An item is in the output only if every one of these holds:
//   1. its id is in `includedItemIds`;
//   2. its category, and every category above it, is showing (a hidden category stays hidden);
//   3. its effective sensitivity (the higher of its own and its category's, D-015) is
//      `normal` or `personal`, or `sensitive` with `includeSensitive`, or `restricted` and
//      listed in `restrictedOptInItemIds`;
//   4. it has no conflict for the view's audience (D-042).
// A note is carried only if `includeNotes` is on AND the answer's own `noteShareable` is on.
//
// Everything is recomputed from the profile each time, so raising an item's sensitivity after
// it was picked holds it back at once, and nothing is ever remembered as "already approved".
//
// A held-back entry carries no value and no note, so a consumer that forgets to filter still
// cannot leak what was held back (I-11). The label stays, so the review screen can say what was
// held back and why.
import { effectiveSensitivity, getAnswer, getCategoryTree } from './selectors.js';
import { resolveAll, listConflicts } from './audience-resolution.js';
import { valueText } from './item-values.js';

/** Why an item is in or out. Only 'included' means it is in the output. */
export const INCLUSION_REASONS = Object.freeze(['included', 'hidden-category', 'sensitive', 'restricted', 'conflict']);

/** Plain words for each reason, for the review screen. */
export const REASON_TEXT = Object.freeze({
  included: 'Included.',
  'hidden-category': 'Held back: its category is hidden.',
  sensitive: 'Held back: it is sensitive, and this view does not include sensitive items.',
  restricted: 'Held back: it is restricted, and you have not chosen to include this item.',
  conflict: 'Held back: this audience has overrides for it that disagree. Keep one first.',
});

/** Items in the order they appear in the chart, hidden categories included. */
function chartOrder(profile) {
  const out = [];
  const walk = (nodes) => { for (const n of nodes) { out.push(...n.items); walk(n.children); } };
  walk(getCategoryTree(profile, { includeHidden: true }));
  return out;
}

/** Whether a category and all of its parents are showing. A missing category counts as hidden. */
export function categoryIsShown(profile, categoryId) {
  const seen = new Set();
  let current = profile.categories.find((c) => c.id === categoryId);
  while (current) {
    if (current.visibility !== 'visible' || seen.has(current.id)) return false;
    seen.add(current.id);
    if (current.parentId === null) return true;
    current = profile.categories.find((c) => c.id === current.parentId);
  }
  return false;
}

/**
 * Decide, item by item, what a view would include. Changes nothing.
 * @param {import('./schema.js').Profile} profile
 * @param {import('./schema.js').Profile['views'][number]} view
 */
export function evaluateView(profile, view) {
  const selected = new Set(view.includedItemIds);
  const optedIn = new Set(view.restrictedOptInItemIds);
  const problems = [];
  const audience = view.audienceId === null ? null : profile.audiences.find((a) => a.id === view.audienceId) ?? null;
  if (view.audienceId !== null && audience === null) problems.push('The audience for this view no longer exists.');

  const resolutions = new Map(resolveAll(profile, audience ? audience.id : null).map((r) => [r.itemId, r]));
  const conflictItems = new Set(audience ? listConflicts(profile).filter((c) => c.audienceId === audience.id).map((c) => c.itemId) : []);

  const entries = [];
  for (const item of chartOrder(profile)) {
    if (!selected.has(item.id)) continue;
    const sensitivity = effectiveSensitivity(profile, item);
    const answer = getAnswer(profile, item.id);

    let reason = 'included';
    if (!categoryIsShown(profile, item.categoryId)) reason = 'hidden-category';
    else if (sensitivity === 'sensitive' && view.includeSensitive !== true) reason = 'sensitive';
    else if (sensitivity === 'restricted' && !optedIn.has(item.id)) reason = 'restricted';
    else if (item.type === 'state' && conflictItems.has(item.id)) reason = 'conflict';

    const base = { itemId: item.id, label: item.label, categoryId: item.categoryId, type: item.type, sensitivity, included: reason === 'included', reason, value: null, note: null };
    if (reason !== 'included') { entries.push(base); continue; }

    if (item.type === 'state') {
      const r = resolutions.get(item.id);
      base.value = {
        kind: 'state', stateId: r.stateId, source: r.source, overrideId: r.overrideId, explanation: r.explanation,
        differs: r.differs, moreOpenThanDefault: r.moreOpenThanDefault,
      };
    } else {
      base.value = { kind: 'text', text: valueText(item, answer) };
    }
    const text = answer?.note ?? '';
    base.note = view.includeNotes === true && answer?.noteShareable === true && text !== '' ? text : null;
    entries.push(base);
  }

  const conflicts = entries.filter((e) => e.reason === 'conflict').map((e) => e.itemId);
  const held = entries.filter((e) => !e.included);
  const byReason = Object.fromEntries(INCLUSION_REASONS.filter((r) => r !== 'included').map((r) => [r, held.filter((e) => e.reason === r).length]));
  return {
    viewId: view.id,
    audienceId: audience ? audience.id : null,
    entries,
    included: entries.filter((e) => e.included),
    held,
    conflicts,
    problems,
    // A view is not built while a conflict would show, or while its audience is missing (D-044).
    buildable: conflicts.length === 0 && problems.length === 0,
    counts: {
      selected: entries.length,
      included: entries.length - held.length,
      held: held.length,
      byReason,
      notes: entries.filter((e) => e.note !== null).length,
    },
  };
}
