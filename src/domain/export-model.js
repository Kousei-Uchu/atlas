// The export view model (spec 10.4, I-02, I-11; M4-06). Pure.
//
// Everything an export shows comes from here, and only from here. Markdown, CSV, SVG and PNG all render
// this one model, so they cannot disagree and none of them can reach back into the profile.
//
// The model holds only what `evaluateView` included: no held-back item, no note that was not both
// chosen and marked shareable, no id of any item, category, audience or view, no other audience's
// name, no override, and not the profile's own title. A model is refused outright while the view is
// not buildable (an unsettled conflict, a missing audience), so nothing is exported on a guess (D-044).
// The fixed statement that preferences are not consent is part of every model (I-02).
import { CONSENT_NOTICE } from '../content/notices.js';
import { evaluateView } from './view-inclusion.js';
import { getState } from './selectors.js';

const fail = (error) => ({ ok: false, error });

/** The parts of a state an export may show. Never an id. */
function shownState(state) {
  return { label: state.label, description: state.description, icon: state.icon, pattern: state.pattern ?? 'solid', color: state.color, textColor: state.textColor, semantic: state.semantic };
}

/** "Parent / Child" for a category, so a nested category is still understood on its own. */
function categoryPath(profile, categoryId) {
  const names = [];
  const seen = new Set();
  let current = profile.categories.find((c) => c.id === categoryId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId === null ? null : profile.categories.find((c) => c.id === current.parentId);
  }
  return names.join(' / ');
}

/**
 * @param {import('./schema.js').Profile} profile
 * @param {import('./schema.js').Profile['views'][number]} view
 * @param {{ generatedAt: string }} options  An ISO timestamp. Only the date is shown.
 * @returns {{ ok: true, model: object } | { ok: false, error: string }}
 */
export function buildExportModel(profile, view, { generatedAt }) {
  if (!view) return fail('That view no longer exists.');
  const evaluation = evaluateView(profile, view);
  if (evaluation.problems.length > 0) return fail(evaluation.problems[0]);
  if (evaluation.conflicts.length > 0) return fail('Some items have overrides that disagree for this audience. Keep one of each before exporting.');
  if (evaluation.included.length === 0) return fail('This view includes nothing yet. Pick at least one item that can be included.');

  const audience = evaluation.audienceId === null ? null : profile.audiences.find((a) => a.id === evaluation.audienceId);
  const sections = [];
  const bySection = new Map();
  const used = new Set();
  for (const entry of evaluation.included) {
    let section = bySection.get(entry.categoryId);
    if (!section) {
      section = { name: categoryPath(profile, entry.categoryId), items: [] };
      bySection.set(entry.categoryId, section);
      sections.push(section);
    }
    if (entry.value.kind === 'state') {
      const state = getState(profile, entry.value.stateId) ?? getState(profile, 'unanswered');
      used.add(state.id);
      section.items.push({ label: entry.label, kind: 'state', state: shownState(state), text: null, note: entry.note });
    } else {
      section.items.push({ label: entry.label, kind: 'text', state: null, text: entry.value.text, note: entry.note });
    }
  }

  // The legend lists each state that appears, in the order the profile keeps its states.
  const legend = profile.states.filter((s) => used.has(s.id)).map(shownState);
  return {
    ok: true,
    model: {
      title: view.name,
      audience: audience ? audience.name : null,
      date: String(generatedAt).slice(0, 10),
      statement: CONSENT_NOTICE,
      notesIncluded: evaluation.counts.notes > 0,
      legend,
      sections,
      itemCount: evaluation.included.length,
    },
  };
}
