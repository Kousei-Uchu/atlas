// Community template files (M8-07, D-074). A template someone else wrote, opened from a file.
// Nothing is fetched and nothing is trusted: the file goes through the same strict template schema
// as bundled templates, then through extra abuse and privacy rules, then is shown to the person
// in full before anything is added. Pure: no React, no storage, no network.
//
// What the rules guard against (docs/decisions/0034-community-templates.md):
//  - contact harvesting and phishing: web addresses, emails, phone numbers and @handles in any text
//  - spoofing: invisible and direction-changing characters, control characters
//  - markup in wording that later reaches exports, and Markdown link syntax
//  - hijacking a bundled module by reusing its id: an imported template never keeps its id or origin
//  - under-labelled content: imported categories are hidden, and never less private than personal
//    (sensitive for adult-intended files), so a file cannot make intimate wording leak into a view
// They are text rules. Nothing here judges meaning, infers anything about a person, or scores a file (I-10).
import { LIMITS } from './limits.js';
import { parseJsonText } from './validation.js';
import { validateTemplate, TEMPLATE_LIMITS } from './templates.js';
import { addModule } from './module-commands.js';
import { newId } from './ids.js';

export const COMMUNITY_LIMITS = Object.freeze({ fileBytes: 256 * 1024 });

const ORDER = ['normal', 'personal', 'sensitive', 'restricted'];
const rank = (level) => ORDER.indexOf(level);
const floorLevel = (level, floor) => (rank(level) >= rank(floor) ? level : floor);

const RULES = [
  ['a web address', /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/i],
  ['a web address', /\b[a-z0-9-]{2,}\.(?:com|net|org|io|app|me|ly|gg|co|xyz|info|biz|ru|cn|tk|ml|ga|cf|top|site|online|link|click|dev|ai|uk|au|us|de|fr|nz)\b/i],
  ['an email address', /[^\s@]+@[^\s@]+\.[^\s@]+/],
  ['an @handle', /(?:^|\s)@\w/],
  ['a phone number', /\+?\d[\d\s().-]{7,}\d/],
  ['markup', /[<>]/],
  ['link syntax', /\]\(/],
];

/** Control, invisible and direction-changing characters, found by code so no raw character sits in the source. */
function hiddenCharacter(text) {
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c <= 8 || (c >= 11 && c <= 31) || (c >= 127 && c <= 159)) return true; // controls (tab, line feed, carriage return are allowed)
    if (c >= 0x200b && c <= 0x200f) return true; // zero width and direction marks
    if (c >= 0x202a && c <= 0x202e) return true; // direction overrides
    if (c >= 0x2060 && c <= 0x2064) return true;
    if (c >= 0x2066 && c <= 0x2069) return true; // direction isolates
    if (c === 0xfeff || c === 0xfffc || c === 0xfffd) return true;
    if (c >= 0xe0000 && c <= 0xe007f) return true; // tag characters
    if (c >= 0xfe00 && c <= 0xfe0f) return true; // variation selectors
  }
  return false;
}

/** Every string in the file with where it is, so a problem can say where without repeating the text. */
function strings(value, path, out) {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}.${i}`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
}

/**
 * The text rules, on a template that already passed the schema.
 * @returns {string[]} problems, never containing the offending text
 */
export function communityTextProblems(raw) {
  const found = [];
  strings(raw, 'template', found);
  const problems = [];
  for (const [path, text] of found) {
    if (hiddenCharacter(text)) problems.push(`${path}: contains an invisible or control character`);
    for (const [name, pattern] of RULES) {
      if (pattern.test(text)) { problems.push(`${path}: contains ${name}`); break; }
    }
  }
  return problems;
}

/**
 * Open the text of a community template file: size, JSON, schema, template rules, then text rules.
 * Never throws. Nothing is added to any profile (I-08).
 * @param {string} text
 */
export function reviewCommunityTemplate(text) {
  const parsed = parseJsonText(text, { maxBytes: COMMUNITY_LIMITS.fileBytes });
  if (!parsed.ok) return { ok: false, problems: [parsed.error.message] };
  const checked = validateTemplate(parsed.value);
  if (!checked.ok) return { ok: false, problems: checked.problems };
  const problems = communityTextProblems(parsed.value);
  if (problems.length > 0) return { ok: false, problems: problems.slice(0, 20) };
  const t = checked.template;
  const items = t.categories.reduce((n, c) => n + c.items.length, 0);
  return {
    ok: true,
    template: t,
    review: {
      categories: t.categories.length,
      items,
      textItems: t.categories.reduce((n, c) => n + c.items.filter((i) => i.type === 'text').length, 0),
      matureWording: t.categories.some((c) => c.mature || c.items.some((i) => i.mature)),
      adultIntended: t.adultIntended,
      floor: t.adultIntended ? 'sensitive' : 'personal',
      limits: { categories: TEMPLATE_LIMITS.categories, items: TEMPLATE_LIMITS.items },
    },
  };
}

/**
 * Add a reviewed community template as ordinary categories and items. They are hidden, carry no
 * origin (so no update or reset can ever reach them), and are never less private than the floor.
 * No answer is created (I-01).
 * @param {{ template: object, makeId?: (prefix: string) => string }} args
 */
export function addCommunityTemplate(profile, { template, makeId = newId }, now) {
  if (template === null || typeof template !== 'object' || !Array.isArray(template.categories)) return { ok: false, error: 'That template is not available.' };
  if (profile.categories.length + template.categories.length > LIMITS.categories) return { ok: false, error: `A profile can have up to ${LIMITS.categories} categories.` };
  const floor = template.adultIntended === true ? 'sensitive' : 'personal';
  // A fresh id means a file can never collide with, or be mistaken for, a bundled module. It is never stored.
  const added = addModule(profile, { template: { ...template, templateId: makeId('tpl') }, visibility: 'hidden', makeId }, now);
  if (!added.ok) return added;
  const made = new Set(added.categoryIds);
  const next = {
    ...added.profile,
    metadata: profile.metadata,
    settings: profile.settings,
    categories: added.profile.categories.map((c) => (made.has(c.id)
      ? { ...c, origin: null, visibility: 'hidden', sensitivity: floorLevel(c.sensitivity, floor) } : c)),
    items: added.profile.items.map((i) => (made.has(i.categoryId)
      ? { ...i, origin: null, sensitivity: floorLevel(i.sensitivity, floor) } : i)),
  };
  return { ok: true, profile: next, categoryIds: added.categoryIds, added: { categories: added.categoryIds.length, items: next.items.length - profile.items.length } };
}
