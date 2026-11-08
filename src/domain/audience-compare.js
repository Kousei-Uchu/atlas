// Compare the person's own answers with what one audience sees (M4-07; I-04, I-05, D-013). Pure.
//
// Only items where the audience sees something other than the person's own answer are listed,
// because those are the ones worth a second look. An audience with no differences has an empty list.
// A conflict counts as a difference (it shows Unanswered) so it is never hidden from this view.
import { resolveAll } from './audience-resolution.js';
import { effectiveSensitivity } from './selectors.js';

/**
 * @param {import('./schema.js').Profile} profile
 * @param {string} audienceId
 * @returns {{ ok: false, error: string } | { ok: true, audienceId: string, rows: object[], counts: object }}
 */
export function compareAudience(profile, audienceId) {
  if (!profile.audiences.some((a) => a.id === audienceId)) return { ok: false, error: 'That audience no longer exists.' };
  const itemsById = new Map(profile.items.map((i) => [i.id, i]));
  const rows = [];
  for (const r of resolveAll(profile, audienceId)) {
    if (!r.differs && r.source !== 'conflict') continue;
    const item = itemsById.get(r.itemId);
    rows.push({
      itemId: r.itemId,
      label: item.label,
      categoryId: item.categoryId,
      sensitivity: effectiveSensitivity(profile, item),
      ownStateId: r.defaultStateId,
      audienceStateId: r.stateId,
      source: r.source,
      moreOpen: r.moreOpenThanDefault,
      reason: r.explanation,
    });
  }
  return {
    ok: true,
    audienceId,
    rows,
    counts: {
      different: rows.length,
      moreOpen: rows.filter((r) => r.moreOpen).length,
      conflicts: rows.filter((r) => r.source === 'conflict').length,
    },
  };
}
