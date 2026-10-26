import { describe, it, expect } from 'vitest';
import { TEMPLATES, CATALOGUE_PROBLEMS, getTemplate, listTemplates } from '../../src/content/templates/index.js';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import { summariseTemplate } from '../../src/domain/templates.js';
import { CONSENT_NOTICE } from '../../src/content/notices.js';
import { LIMITS } from '../../src/domain/limits.js';

const EXPECTED_IDS = [
  'starter', 'names-pronouns', 'gendered-language', 'physical-contact', 'personal-space', 'communication', 'emotional-support',
  'sensory-profile', 'accessibility-needs', 'privacy-digital', 'school-work', 'everyday-practical', 'conflict-repair', 'instruction-sheet', 'overwhelm-plan',
  'relationship-affection', 'intimacy-boundaries', 'attraction', 'anatomy-compatibility', 'gender-expression', 'body-comfort', 'emergency-card',
];

const RESTRICTED_IDS = ['relationship-affection', 'intimacy-boundaries', 'attraction', 'anatomy-compatibility', 'gender-expression', 'emergency-card'];
const HIDDEN_IDS = [...RESTRICTED_IDS, 'body-comfort'];

// Every string a person could read in a template.
function* words(t) {
  yield t.title; yield t.summary;
  for (const c of t.categories) {
    yield c.name; yield c.description;
    for (const i of c.items) { yield i.label; yield i.description; }
  }
}

describe('the bundled catalogue (M3-01 to M3-05)', () => {
  it('has no problems, and every template listed in the spec so far', () => {
    expect(CATALOGUE_PROBLEMS).toEqual([]);
    expect(TEMPLATES.map((t) => t.templateId)).toEqual(EXPECTED_IDS);
    expect(listTemplates()).toBe(TEMPLATES);
  });

  it('finds a template by id and returns null for an unknown one', () => {
    expect(getTemplate('communication').title).toBe('Communication preferences');
    expect(getTemplate('nope')).toBeNull();
    expect(getTemplate('__proto__')).toBeNull();
  });

  it('is frozen, so nothing can edit a template by accident', () => {
    expect(Object.isFrozen(TEMPLATES)).toBe(true);
    expect(() => TEMPLATES.push({})).toThrow();
  });

  it('gives every template a version, the statement, and the same wording the app shows (I-02)', () => {
    for (const t of TEMPLATES) {
      expect(t.version, t.templateId).toBeGreaterThanOrEqual(1);
      expect(t.statement, t.templateId).toBe('preferences-not-consent');
    }
    expect(CONSENT_NOTICE).toMatch(/not permission/);
  });

  it('marks only the starter as sample content, shows the everyday templates and hides the rest until turned on', () => {
    expect(TEMPLATES.filter((t) => t.isSample).map((t) => t.templateId)).toEqual(['starter']);
    for (const t of TEMPLATES.filter((x) => x.templateId !== 'starter' && !HIDDEN_IDS.includes(x.templateId))) {
      expect(t.defaultVisibility, t.templateId).toBe('visible');
      expect(t.adultIntended, t.templateId).toBe(false);
    }
    for (const id of HIDDEN_IDS) expect(getTemplate(id).defaultVisibility, id).toBe('hidden');
  });

  it('marks the relationship and body modules as intended for adults, and the emergency card as not (D-037)', () => {
    for (const id of HIDDEN_IDS.filter((x) => x !== 'emergency-card')) expect(getTemplate(id).adultIntended, id).toBe(true);
    expect(getTemplate('emergency-card').adultIntended).toBe(false);
  });

  it('uses the sensitivity levels the spec table gives for each template', () => {
    const levels = (id) => new Set(getTemplate(id).categories.map((c) => c.sensitivity));
    expect(levels('names-pronouns')).toEqual(new Set(['personal']));
    expect(levels('gendered-language')).toEqual(new Set(['sensitive']));
    expect(levels('personal-space')).toEqual(new Set(['personal']));
    expect(levels('communication')).toEqual(new Set(['normal']));
    expect(levels('emotional-support')).toEqual(new Set(['sensitive']));
    expect(levels('sensory-profile')).toEqual(new Set(['personal']));
    expect(levels('accessibility-needs')).toEqual(new Set(['sensitive']));
    expect(levels('privacy-digital')).toEqual(new Set(['sensitive']));
    expect(levels('school-work')).toEqual(new Set(['normal']));
    expect(levels('everyday-practical')).toEqual(new Set(['normal']));
    expect(levels('conflict-repair')).toEqual(new Set(['personal']));
    expect(levels('instruction-sheet')).toEqual(new Set(['personal']));
    expect(levels('overwhelm-plan')).toEqual(new Set(['sensitive']));
    // Physical contact is personal, with the closer friendly contact raised to sensitive.
    expect(levels('physical-contact')).toEqual(new Set(['personal', 'sensitive']));
    for (const id of RESTRICTED_IDS) expect(levels(id), id).toEqual(new Set(['restricted']));
    expect(levels('body-comfort')).toEqual(new Set(['sensitive']));
  });

  it('is a useful size: no template is empty or too large for a profile to hold several', () => {
    for (const t of TEMPLATES) {
      const { items, categories } = summariseTemplate(t);
      expect(items, t.templateId).toBeGreaterThanOrEqual(7);
      expect(items, t.templateId).toBeLessThanOrEqual(120);
      expect(categories, t.templateId).toBeLessThanOrEqual(10);
    }
    // Every template together must still fit in one profile, with room left for the person's own items.
    const total = TEMPLATES.reduce((n, t) => n + summariseTemplate(t).items, 0);
    expect(total).toBeLessThan(LIMITS.items / 2);
    // Categories are small, so the guard for them is two thirds of the limit (102 of 200 used by M3-05).
    expect(TEMPLATES.reduce((n, t) => n + t.categories.length, 0)).toBeLessThan(LIMITS.categories * 0.67);
  });

  it('has no repeated label inside a template', () => {
    for (const t of TEMPLATES) {
      const labels = t.categories.flatMap((c) => c.items.map((i) => i.label.toLowerCase()));
      expect(new Set(labels).size, t.templateId).toBe(labels.length);
    }
  });

  it('uses plain wording: no em dashes, emoji or decorative symbols', () => {
    const banned = /[\u2014\u2013\u00A7\u2022\u2192\u2713\u2717]|\p{Extended_Pictographic}/u;
    for (const t of TEMPLATES) for (const text of words(t)) expect(text, `${t.templateId}: ${text}`).not.toMatch(banned);
  });

  it('writes items as things people can have a preference about, not as labels for the person', () => {
    // I-10 and spec 12.3: no diagnoses, and nothing that assigns or suggests an identity label.
    const unwanted = /\b(autis|adhd|disorder|syndrome|diagnos|disabled person|transgender|cisgender|non-?binary|bisexual|asexual|lesbian|gay)\b/i;
    for (const t of TEMPLATES) for (const text of words(t)) expect(text, `${t.templateId}: ${text}`).not.toMatch(unwanted);
  });

  it('never prefills a text item, and never suggests a pronoun set', () => {
    for (const t of TEMPLATES) {
      for (const c of t.categories) for (const i of c.items) expect(Object.keys(i).sort(), i.key).toEqual(['description', 'key', 'label', 'sensitivity', 'tags', 'type']);
    }
    const pronouns = getTemplate('names-pronouns');
    const text = [...words(pronouns)].join(' ');
    expect(text).not.toMatch(/\b(he\/him|she\/her|they\/them|xe|ze)\b/i);
  });

  it('covers friendly and platonic contact as ordinary content (spec 12.3)', () => {
    const labels = getTemplate('physical-contact').categories.flatMap((c) => c.items.map((i) => i.label.toLowerCase())).join(' | ');
    expect(labels).toMatch(/a hug from a close friend/);
    expect(labels).toMatch(/holding hands as friends/);
    expect(labels).toMatch(/cuddling/);
    expect(labels).toMatch(/leaning/);
    expect(labels).toMatch(/resting their head on my shoulder/);
  });

  it('contains no explicit sexual wording in any template, including the restricted ones (spec 12.3)', () => {
    const explicit = /\b(sex|sexual|sexually|erotic|genital\w*|arousal|aroused|orgasm|naked|nude|porn\w*|fetish\w*|kink\w*)\b/i;
    for (const t of TEMPLATES) for (const text of words(t)) expect(text, `${t.templateId}: ${text}`).not.toMatch(explicit);
  });

  it('uses text items for anything the person writes, and never for a choice', () => {
    for (const id of ['instruction-sheet', 'overwhelm-plan']) {
      const items = getTemplate(id).categories.flatMap((c) => c.items);
      expect(items.filter((i) => i.type === 'text').length, id).toBeGreaterThanOrEqual(5);
    }
    for (const t of TEMPLATES) for (const c of t.categories) for (const i of c.items) {
      if (i.type === 'text') expect(i.tags, i.key).toEqual([]);
    }
  });

  it('keeps the starter template in step with the starter profile', () => {
    const starter = getTemplate('starter');
    const profile = createStarterProfile({ id: 'p1', now: '2026-10-26T10:00:00.000Z' });
    expect(profile.metadata.templateIds).toEqual(['starter']);
    expect(starter.categories.map((c) => [c.key, c.name, c.sensitivity])).toEqual(profile.categories.map((c) => [c.origin.key, c.name, c.sensitivity]));
    const fromTemplate = starter.categories.flatMap((c) => c.items.map((i) => [i.key, c.key, i.label, i.sensitivity]));
    const fromProfile = profile.items.map((i) => [i.origin.key, i.categoryId, i.label, i.sensitivity]);
    expect(fromTemplate).toEqual(fromProfile);
    for (const item of profile.items) expect(item.origin.templateVersion).toBe(starter.version);
    expect(validateProfile(profile).ok).toBe(true);
  });
});
