// Number, date and choice items (M8-05, D-072). Pure.
//
// A number or a date is kept in the answer's `text` in one canonical form, so a view, an export and a share
// link carry it as plain words and nothing downstream needs to know the type. A choice keeps the ids of the
// chosen options, and is shown as the option labels in the order the item lists them (not the order chosen,
// which carries no meaning). None of these types is a state: they have no colour, no score, and no audience
// override, and an empty one is Unanswered, which is not stored (I-01, I-10).
import { LIMITS } from './limits.js';

export const VALUE_TYPES = Object.freeze(['number', 'date', 'choice']);
export const ITEM_TYPE_LABELS = Object.freeze({ state: 'State', text: 'Text', number: 'Number', date: 'Date', choice: 'Choice from a list' });
export const NUMBER_LIMIT = 1_000_000_000_000;
export const MAX_DECIMALS = 6;

/**
 * The one written form of a number: no plus sign, no leading zeros, no trailing zeros, "-0" is "0".
 * @returns {string | null} null when the text is not a number this app keeps
 */
export function canonicalNumber(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!/^-?(\d+)(\.\d{1,6})?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || Math.abs(value) > NUMBER_LIMIT) return null;
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const digits = whole.replace(/^0+(?=\d)/, '');
  const trimmed = fraction.replace(/0+$/, '');
  const body = trimmed === '' ? digits : `${digits}.${trimmed}`;
  return text.startsWith('-') && body !== '0' ? `-${body}` : body;
}

/** A real calendar date as YYYY-MM-DD, not a time. */
export function canonicalDate(input) {
  if (typeof input !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= last ? m[0] : null;
}

/** Option labels for a choice item, in the order the item lists them. Unknown ids are ignored. */
export function chosenLabels(item, choices) {
  const picked = new Set(choices ?? []);
  return (item.options ?? []).filter((o) => picked.has(o.id)).map((o) => o.label);
}

/**
 * What an answer says, as words, for views, exports and lists. Empty string for no answer.
 * @param {{ type: string, unit?: string, options?: Array<{id: string, label: string}> }} item
 * @param {{ text?: string, choices?: string[] } | undefined} answer
 */
export function valueText(item, answer) {
  if (!answer) return '';
  if (item.type === 'choice') return chosenLabels(item, answer.choices).join(', ');
  const text = answer.text ?? '';
  if (item.type === 'number' && text !== '' && item.unit) return `${text} ${item.unit}`;
  return text;
}

/** Whether an answer holds anything for this item's type. */
export function hasValue(item, answer) {
  if (!answer) return false;
  return item.type === 'choice' ? (answer.choices ?? []).length > 0 : (answer.text ?? '') !== '';
}

/**
 * Turn a list of typed labels into options for `setItemOptions` or `addItem`. An option whose label already exists on
 * the item keeps its id (so its answers stay); a new label gets an id from `makeId`.
 * @param {{ options?: Array<{ id: string, label: string }> } | null} item the item being edited, or null for a new one
 * @param {string[]} labels
 * @param {() => string} makeId
 */
export function planOptions(item, labels, makeId) {
  const existing = new Map((item?.options ?? []).map((o) => [o.label.toLowerCase(), o.id]));
  return cleanOptionLabels(labels).map((label) => ({ id: existing.get(label.toLowerCase()) ?? makeId(), label }));
}

/** Clean a list of option labels: trimmed, no blanks, no repeats (ignoring case), at most the limit. */
export function cleanOptionLabels(labels) {
  const seen = new Set();
  const out = [];
  for (const raw of labels) {
    const label = String(raw).replace(/\s+/g, ' ').trim();
    if (label === '' || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out.slice(0, LIMITS.optionsPerItem);
}
