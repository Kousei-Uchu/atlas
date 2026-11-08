// The share envelope (spec 11.2; I-02, I-08, I-11; M5-01).
//
// It has its own strict schema and does not reuse the profile schema. It is built from the export
// model, so it holds only what the inclusion rule let through: no ids, no audiences, no overrides,
// no held-back item, no profile title. The fixed statement that preferences are not consent is
// always present, and a decoded envelope whose statement differs is refused (I-02).
//
// Items refer to their state by position in `states`, which keeps a link short. Everything decoded
// is untrusted (I-08): strict fields, length and count limits, hex colours, known icons and
// patterns, control characters removed, and text is only ever shown as text.
import { z } from 'zod';
import { LIMITS } from '../domain/limits.js';
import { STATE_ICONS, STATE_PATTERNS, STATE_SEMANTICS } from '../domain/schema.js';
import { CONSENT_NOTICE } from '../content/notices.js';
import { stripControl } from '../export/clean.js';

export const SHARE_FORMAT = 'atlas-share';

const text = (max, min = 0) => z.string().max(max).transform(stripControl).pipe(z.string().min(min));
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const stateSchema = z.strictObject({
  label: text(LIMITS.stateLabelLength, 1),
  description: text(LIMITS.stateDescriptionLength),
  icon: z.enum(STATE_ICONS),
  pattern: z.enum(STATE_PATTERNS),
  color: hex,
  textColor: hex,
  semantic: z.enum(STATE_SEMANTICS),
});

const itemSchema = z.strictObject({
  label: text(LIMITS.labelLength, 1),
  kind: z.enum(['state', 'text']),
  state: z.number().int().min(0).max(LIMITS.states - 1).nullable(),
  text: text(LIMITS.textLength).nullable(),
  note: text(LIMITS.noteLength).nullable(),
});

const groupSchema = z.strictObject({
  name: text(LIMITS.categoryNameLength * LIMITS.categoryDepth + 20, 1),
  items: z.array(itemSchema).min(1).max(LIMITS.items),
});

export const shareEnvelopeSchema = z.strictObject({
  format: z.literal(SHARE_FORMAT),
  title: text(LIMITS.titleLength, 1),
  createdAt: z.iso.datetime(),
  includesNotes: z.boolean(),
  states: z.array(stateSchema).max(LIMITS.states),
  groups: z.array(groupSchema).min(1).max(LIMITS.categories),
  statement: z.literal(CONSENT_NOTICE),
}).superRefine((env, ctx) => {
  let items = 0;
  let notes = 0;
  env.groups.forEach((group, g) => {
    group.items.forEach((item, i) => {
      items += 1;
      if (item.note !== null && item.note !== '') notes += 1;
      const at = ['groups', g, 'items', i];
      if (item.kind === 'state') {
        if (item.state === null || item.state >= env.states.length) ctx.addIssue({ code: 'custom', path: at, message: 'An item refers to a state that is not listed.' });
        if (item.text !== null) ctx.addIssue({ code: 'custom', path: at, message: 'A state item has no written text.' });
      } else if (item.state !== null || item.text === null) {
        ctx.addIssue({ code: 'custom', path: at, message: 'A text item has text and no state.' });
      }
    });
  });
  if (items > LIMITS.items) ctx.addIssue({ code: 'custom', path: ['groups'], message: 'Too many items.' });
  if (notes > 0 && !env.includesNotes) ctx.addIssue({ code: 'custom', path: ['includesNotes'], message: 'Notes are present but the envelope says it has none.' });
});

/**
 * Turn an export model into an envelope. Refuses a model with no items.
 * @param {object} model  From buildExportModel.
 * @param {{ createdAt: string }} options  An ISO timestamp.
 */
export function buildEnvelope(model, { createdAt }) {
  const states = model.legend.map((s) => ({
    label: s.label, description: s.description, icon: s.icon, pattern: s.pattern ?? 'solid', color: s.color, textColor: s.textColor, semantic: s.semantic,
  }));
  const index = (state) => model.legend.findIndex((s) => s.label === state.label && s.color === state.color && s.icon === state.icon && (s.pattern ?? 'solid') === (state.pattern ?? 'solid'));
  const groups = model.sections.map((section) => ({
    name: section.name,
    items: section.items.map((item) => ({
      label: item.label, kind: item.kind, state: item.kind === 'state' ? index(item.state) : null, text: item.kind === 'text' ? item.text ?? '' : null, note: item.note ?? null,
    })),
  }));
  const envelope = { format: SHARE_FORMAT, title: model.title, createdAt, includesNotes: model.notesIncluded, states, groups, statement: CONSENT_NOTICE };
  return checkEnvelope(envelope);
}

/**
 * Validate an untrusted value as an envelope. Returns a cleaned copy, never the input.
 * @returns {{ ok: true, envelope: object } | { ok: false, problems: string[] }}
 */
export function checkEnvelope(value) {
  const result = shareEnvelopeSchema.safeParse(value);
  if (result.success) return { ok: true, envelope: result.data };
  const problems = result.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || 'envelope'}: ${i.message}`);
  return { ok: false, problems };
}
