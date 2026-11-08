// A shared chart saved as the person's own copy (D-016, I-12; M5-02). Pure.
//
// The copy is a new profile. It has the chart's states, one category per heading, and the items with
// their answers and notes. It has no audiences, views or overrides, because the envelope carried
// none. Items stay editable, and nothing here touches any profile that already exists.
//
// The envelope does not say how sensitive anything was, so categories are 'personal'. They are
// someone else's answers, not the person's own, and the person can change that in the copy.
import { createDefaultSettings, createDefaultStates, UNANSWERED_ID } from '../domain/defaults.js';
import { LIMITS, SCHEMA_VERSION } from '../domain/limits.js';
import { validateProfile } from '../domain/validation.js';
import { newId } from '../domain/ids.js';

const same = (a, b) => a.label === b.label && a.color.toLowerCase() === b.color.toLowerCase() && a.textColor.toLowerCase() === b.textColor.toLowerCase()
  && a.icon === b.icon && (a.pattern ?? 'solid') === (b.pattern ?? 'solid') && a.semantic === b.semantic;

const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * @param {object} envelope  Already validated by checkEnvelope.
 * @param {{ id: string, now: string, makeId?: (prefix: string) => string }} args
 */
export function profileFromEnvelope(envelope, { id, now, makeId = newId }) {
  const defaults = createDefaultStates();
  // Unanswered always comes first (I-01). Then each of the chart's states: a built-in one when it is
  // exactly that one, otherwise the chart's own. A state that would pass the limit is not kept, and
  // its answers become Unanswered, which is never a yes. The description says so.
  const states = [defaults.find((d) => d.isUnanswered)];
  const stateIds = [];
  let dropped = 0;
  envelope.states.forEach((s, index) => {
    const match = defaults.find((d) => !d.isUnanswered && same(d, s));
    const existing = match ? states.find((x) => x.id === match.id) : null;
    if (existing) { stateIds.push(existing.id); return; }
    if (states.length >= LIMITS.states) { stateIds.push(UNANSWERED_ID); dropped += 1; return; }
    if (match) { states.push(match); stateIds.push(match.id); return; }
    const stateId = `shared_${index}`;
    states.push({
      id: stateId, label: s.label, description: s.description, color: s.color, textColor: s.textColor, icon: s.icon, pattern: s.pattern,
      cycleOrder: 100 + index * 10, semantic: s.semantic, isUnanswered: false, isSystem: false, isSelectable: true,
    });
    stateIds.push(stateId);
  });
  // Room is left for the person's own states, up to the limit.
  for (const d of defaults) if (states.length < LIMITS.states && !states.some((x) => x.id === d.id)) states.push(d);

  const categories = [];
  const items = [];
  const answers = [];
  envelope.groups.forEach((group, g) => {
    const categoryId = makeId('category');
    categories.push({
      id: categoryId, name: cut(group.name, LIMITS.categoryNameLength), description: '', parentId: null, sortOrder: (g + 1) * 10,
      sensitivity: 'personal', visibility: 'visible', origin: null,
    });
    group.items.forEach((item, i) => {
      const itemId = makeId('item');
      items.push({
        id: itemId, categoryId, type: item.kind, label: item.label, description: '', sortOrder: (i + 1) * 10, sensitivity: 'normal', tags: [], origin: null,
      });
      const answer = { itemId, noteShareable: false };
      // Unanswered is stored as no answer at all (I-01), so a state that was not kept leaves none.
      if (item.kind === 'state' && stateIds[item.state] !== UNANSWERED_ID) answer.stateId = stateIds[item.state];
      else answer.text = item.text ?? '';
      if (item.note) answer.note = item.note;
      if (answer.stateId !== undefined || (answer.text ?? '') !== '' || answer.note) answers.push(answer);
    });
  });

  const date = String(envelope.createdAt).slice(0, 10);
  const profile = {
    schemaVersion: SCHEMA_VERSION, id, revision: 0,
    title: cut(`Shared: ${envelope.title}`, LIMITS.titleLength),
    description: cut(`A copy of a chart shared on ${date}. These are another person's answers. A chart shows preferences. It is not permission.${dropped > 0 ? ` ${dropped} of its states could not be kept, so answers that used them are Unanswered.` : ''}`, LIMITS.descriptionLength),
    createdAt: now, updatedAt: now,
    settings: createDefaultSettings(), states, categories, items, answers, audiences: [], overrides: [], views: [],
    metadata: { templateIds: [] },
  };
  const checked = validateProfile(profile);
  if (!checked.ok) return { ok: false, error: checked.error.message };
  return { ok: true, profile: checked.profile };
}
