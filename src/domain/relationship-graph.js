// What the relationship graph shows, worked out from the profile (M7-06, D-066). Pure and read-only.
//
// The graph is the person's audiences, with "Me" at the root and each audience inside the one it was placed in
// (`parentId`). It has no data of its own. Each audience carries plain counts of what the person has set for it:
// overrides, saved views and answers that differ from their own. The counts are facts, not a rating of the
// relationship: nothing here is scored, ranked, coloured by closeness or used to say how close anyone is (I-10).
import { compareAudience } from './audience-compare.js';

const MAX_DEPTH = 20;

/**
 * Audiences in reading order (each parent, then its children, in the order the audiences are kept).
 * An unknown parent, or a loop of parents, never hides an audience: it is shown at the top level instead.
 * @returns {{ nodes: Array<{ audience: object, depth: number, parentId: string | null, overrides: number, views: number, differing: number }> }}
 */
export function relationshipGraph(profile) {
  const byId = new Map(profile.audiences.map((a) => [a.id, a]));
  const children = new Map();
  const roots = [];
  for (const a of profile.audiences) {
    if (a.parentId && a.parentId !== a.id && byId.has(a.parentId)) {
      if (!children.has(a.parentId)) children.set(a.parentId, []);
      children.get(a.parentId).push(a);
    } else roots.push(a);
  }
  const seen = new Set();
  const nodes = [];
  const walk = (audience, depth, parentId) => {
    if (seen.has(audience.id)) return;
    seen.add(audience.id);
    nodes.push({ audience, depth: Math.min(depth, MAX_DEPTH), parentId });
    for (const child of children.get(audience.id) ?? []) walk(child, depth + 1, audience.id);
  };
  for (const root of roots) walk(root, 0, null);
  // Only a loop of parents leaves anyone unvisited; show them at the top level.
  for (const a of profile.audiences) walk(a, 0, null);

  return {
    nodes: nodes.map((n) => {
      const compared = compareAudience(profile, n.audience.id);
      return {
        ...n,
        overrides: profile.overrides.filter((o) => o.audienceId === n.audience.id).length,
        views: profile.views.filter((v) => v.audienceId === n.audience.id).length,
        differing: compared.ok ? compared.counts.different : 0,
      };
    }),
  };
}
