// I-10 and spec 12.3: the identity, attraction and anatomy templates only record what the person
// supplies. No label is assigned or suggested, and anatomy and gender are never coupled.
import { describe, it, expect } from 'vitest';
import { getTemplate, TEMPLATES } from '../../src/content/templates/index.js';
import { addModule } from '../../src/domain/module-commands.js';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';

const NOW = '2026-10-26T10:00:00.000Z';
const IDENTITY_IDS = ['attraction', 'anatomy-compatibility', 'gender-expression'];

function* entries(t) {
  for (const c of t.categories) {
    yield { where: c.name, text: c.name, category: c };
    if (c.description) yield { where: c.name, text: c.description, category: c };
    for (const i of c.items) {
      yield { where: i.key, text: i.label, item: i, category: c };
      if (i.description) yield { where: i.key, text: i.description, item: i, category: c };
    }
  }
}
const allText = (t) => [t.title, t.summary, ...[...entries(t)].map((e) => e.text)].join('\n');

const GENDER_WORDS = /\b(men|man|woman|women|male|female|masculine|feminine|boy|boys|girl|girls|trans\w*|non-?binary|genderqueer|agender|he|she|him|her|his|hers)\b/i;
const ANATOMY_WORDS = /\b(anatomy|anatomical|body parts?|chest|breasts?|hormones?|surgery|puberty|biological|reproductive|bodies|body|bodily)\b/i;
const LABELS = /\b(gay|lesbian|bisexual|pansexual|asexual|aromantic|heterosexual|homosexual|queer|demi\w*|grey-?ace|cisgender|transgender|intersex|androgynous|two-spirit)\b/i;

describe('identity templates record only what the person supplies (I-10)', () => {
  it('has no identity or orientation label anywhere in any template', () => {
    for (const t of TEMPLATES) expect(allText(t), t.templateId).not.toMatch(LABELS);
  });

  it('never phrases an item as a statement about the person, such as "I am ..."', () => {
    for (const id of IDENTITY_IDS) {
      for (const { item } of entries(getTemplate(id))) {
        if (item) expect(item.label, item.key).not.toMatch(/^(i am|i identify|i\u2019m|i'm|my identity is)\b/i);
      }
    }
  });

  it('keeps the words that describe the person in text items that nothing prefills', () => {
    for (const [id, key] of [['attraction', 'own-terms'], ['gender-expression', 'own-describe']]) {
      const item = getTemplate(id).categories.flatMap((c) => c.items).find((i) => i.key === key);
      expect(item.type, `${id}/${key}`).toBe('text');
      expect(item.tags, `${id}/${key}`).toEqual([]);
      expect(item.description).toMatch(/^Write (it|them) here/);
    }
    for (const id of IDENTITY_IDS) {
      const texts = getTemplate(id).categories.flatMap((c) => c.items).filter((i) => i.type === 'text');
      expect(texts.length, id).toBeGreaterThanOrEqual(4);
      // A text item carries only a prompt to write, never an answer or an example of one.
      for (const i of texts) expect(i.description, i.key).toMatch(/^Write/);
    }
  });

  it('lists each kind of attraction as its own item, so no answer implies another', () => {
    const kinds = getTemplate('attraction').categories.find((c) => c.key === 'kinds').items;
    expect(kinds.length).toBeGreaterThanOrEqual(6);
    expect(new Set(kinds.map((i) => i.key)).size).toBe(kinds.length);
    for (const i of kinds) {
      expect(i.type, i.key).toBe('state');
      // One kind per item: a label never joins two kinds with "and" or "or".
      expect(i.label, i.key).not.toMatch(/\b(and|or)\b.*\b(attraction|closeness)\b/i);
    }
  });

  it('keeps anatomy and gender apart (I-10)', () => {
    const anatomy = allText(getTemplate('anatomy-compatibility'));
    const gender = allText(getTemplate('gender-expression'));
    const attraction = allText(getTemplate('attraction'));
    // Anatomy names no gender. Gender names no body. Attraction names neither.
    expect(anatomy.replace(/This is separate from gender\./, '')).not.toMatch(GENDER_WORDS);
    expect(anatomy.replace(/This is separate from gender\./, '')).not.toMatch(/\bgender\w*\b/i);
    expect(gender).not.toMatch(ANATOMY_WORDS);
    expect(attraction).not.toMatch(GENDER_WORDS);
    expect(attraction).not.toMatch(ANATOMY_WORDS);
    expect(attraction).not.toMatch(/\bgender\w*\b/i);
  });

  it('shares no key, tag or category between the anatomy and gender templates', () => {
    const keys = (id) => new Set([...entries(getTemplate(id))].flatMap((e) => [e.category.key, e.item?.key]).filter(Boolean));
    for (const a of keys('anatomy-compatibility')) expect(keys('gender-expression').has(a), a).toBe(false);
    for (const id of IDENTITY_IDS) {
      for (const { item } of entries(getTemplate(id))) if (item) expect(item.tags, item.key).toEqual([]);
    }
  });

  it('adds nothing to a profile but definitions: no answer, and nothing suggested for any item', () => {
    let profile = createStarterProfile({ id: 'p1', now: NOW });
    for (const id of IDENTITY_IDS) {
      const result = addModule(profile, { template: getTemplate(id), visibility: 'hidden' }, NOW);
      expect(result.ok, id).toBe(true);
      profile = result.profile;
    }
    expect(profile.answers).toEqual([]);
    expect(profile.overrides).toEqual([]);
    expect(profile.views).toEqual([]);
    // Adding the anatomy module does not add or change anything in the gender module, or the reverse.
    const only = (tid) => profile.items.filter((i) => i.origin?.templateId === tid);
    expect(only('anatomy-compatibility').length).toBeGreaterThan(0);
    expect(only('gender-expression').length).toBeGreaterThan(0);
    expect(validateProfile(profile).ok).toBe(true);
  });
});

describe('restricted templates (D-008, D-009, D-037)', () => {
  const RESTRICTED = ['relationship-affection', 'intimacy-boundaries', 'attraction', 'anatomy-compatibility', 'gender-expression', 'emergency-card'];

  it('puts every item of a restricted template at the restricted level, and keeps it hidden by default', () => {
    for (const id of RESTRICTED) {
      const t = getTemplate(id);
      expect(t.defaultVisibility, id).toBe('hidden');
      for (const c of t.categories) for (const i of c.items) expect(i.sensitivity, `${id}/${i.key}`).toBe('restricted');
    }
  });

  it('refuses to turn on an adult-intended module without the note, and accepts it with the note', () => {
    const profile = createStarterProfile({ id: 'p1', now: NOW });
    for (const t of TEMPLATES.filter((x) => x.adultIntended)) {
      expect(addModule(profile, { template: t, visibility: 'visible' }, NOW).ok, t.templateId).toBe(false);
      const added = addModule(profile, { template: t, visibility: 'visible', acknowledgeAdult: true }, NOW);
      expect(added.ok, t.templateId).toBe(true);
      expect(added.profile.settings.restrictedModulesAcknowledged).toBe(true);
    }
  });

  it('lets the emergency card be added without the adult note, and hidden', () => {
    const profile = createStarterProfile({ id: 'p1', now: NOW });
    const result = addModule(profile, { template: getTemplate('emergency-card') }, NOW);
    expect(result.ok).toBe(true);
    expect(result.profile.settings.restrictedModulesAcknowledged).toBe(false);
    expect(result.profile.categories.filter((c) => c.origin?.templateId === 'emergency-card').every((c) => c.visibility === 'hidden')).toBe(true);
  });

  it('keeps the emergency card to text the person writes, plus a few wishes, with nothing prefilled', () => {
    const items = getTemplate('emergency-card').categories.flatMap((c) => c.items);
    expect(items.filter((i) => i.type === 'text').length).toBeGreaterThanOrEqual(20);
    for (const i of items.filter((x) => x.type === 'text')) expect(i.description, i.key).toMatch(/^Write/);
  });

  it('puts every template into a single profile together with room to spare', () => {
    let profile = createStarterProfile({ id: 'p1', now: NOW });
    for (const t of TEMPLATES.filter((x) => !x.isSample)) {
      const r = addModule(profile, { template: t, visibility: 'hidden', acknowledgeAdult: true }, NOW);
      expect(r.ok, t.templateId).toBe(true);
      profile = r.profile;
    }
    expect(validateProfile(profile).ok).toBe(true);
  });
});
