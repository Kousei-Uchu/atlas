// Where two audiences' answers overlap (M7-07, D-067). Pure and read-only.
//
// For two audiences it sorts every item in the visible groups by what each of them sees:
//   - `both`   answered for both audiences (split into `same` when the answer is the same, `different` when not)
//   - `onlyA`  answered for the first audience and Unanswered for the second
//   - `onlyB`  answered for the second and Unanswered for the first
// Items Unanswered for both are left out. Unanswered is the absence of an answer (I-01), so it is never a match.
// Nothing here says how close or alike two audiences are: there is no percentage, total or verdict (I-10).
import { resolveAll } from './audience-resolution.js';
import { getState } from './selectors.js';

/**
 * @returns {{ ok: false, error: string } | { ok: true, same: object[], different: object[], onlyA: object[], onlyB: object[] }}
 * Each row is `{ item, category, a: state, b: state }`.
 */
export function audienceOverlap(profile, audienceA, audienceB) {
  const has = (id) => profile.audiences.some((a) => a.id === id);
  if (!has(audienceA) || !has(audienceB)) return { ok: false, error: 'That audience no longer exists.' };
  if (audienceA === audienceB) return { ok: false, error: 'Choose two different audiences.' };
  const items = new Map(profile.items.map((i) => [i.id, i]));
  const categories = new Map(profile.categories.map((c) => [c.id, c]));
  const b = new Map(resolveAll(profile, audienceB).map((r) => [r.itemId, r]));
  const out = { same: [], different: [], onlyA: [], onlyB: [] };
  for (const left of resolveAll(profile, audienceA)) {
    const item = items.get(left.itemId);
    const category = categories.get(item.categoryId);
    if (!category || category.visibility !== 'visible') continue;
    const right = b.get(left.itemId);
    const sa = getState(profile, left.stateId);
    const sb = getState(profile, right.stateId);
    const aAnswered = Boolean(sa) && !sa.isUnanswered;
    const bAnswered = Boolean(sb) && !sb.isUnanswered;
    const row = { item, category, a: sa, b: sb };
    if (aAnswered && bAnswered) out[sa.id === sb.id ? 'same' : 'different'].push(row);
    else if (aAnswered) out.onlyA.push(row);
    else if (bAnswered) out.onlyB.push(row);
  }
  return { ok: true, ...out };
}
