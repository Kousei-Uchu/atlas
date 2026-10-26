import { describe, it, expect } from 'vitest';
import { buildCatalogue, normaliseTemplate, originFor, summariseTemplate, validateTemplate, TEMPLATE_LIMITS } from '../../src/domain/templates.js';

const valid = () => ({
  templateId: 'sample-one',
  version: 1,
  title: 'Sample one',
  summary: 'A small template for tests.',
  defaultVisibility: 'visible',
  adultIntended: false,
  isSample: false,
  statement: 'preferences-not-consent',
  categories: [
    { key: 'cat-a', name: 'Category A', sensitivity: 'personal', items: [{ key: 'item-a', label: 'Item A' }, { key: 'item-b', type: 'text', label: 'Item B', sensitivity: 'sensitive', tags: ['x'] }] },
    { key: 'cat-b', name: 'Category B', description: 'About B', sensitivity: 'normal', items: [{ key: 'item-c', label: 'Item C', description: 'Details' }] },
  ],
});

describe('validateTemplate', () => {
  it('accepts a well-formed template and fills in the defaults', () => {
    const result = validateTemplate(valid());
    expect(result.ok).toBe(true);
    const [a, b] = result.template.categories;
    expect(a.description).toBe('');
    expect(a.items[0]).toEqual({ key: 'item-a', type: 'state', label: 'Item A', description: '', sensitivity: 'personal', tags: [] });
    expect(a.items[1].sensitivity).toBe('sensitive');
    expect(b.description).toBe('About B');
  });

  it('returns frozen data and does not change its input (I-05)', () => {
    const raw = valid();
    const before = JSON.stringify(raw);
    const { template } = validateTemplate(raw);
    expect(JSON.stringify(raw)).toBe(before);
    expect(Object.isFrozen(template)).toBe(true);
    expect(Object.isFrozen(template.categories[0].items[0])).toBe(true);
    expect(() => { template.categories[0].name = 'x'; }).toThrow();
  });

  it.each([
    ['an unknown field', (t) => { t.extra = 1; }],
    ['an unknown item field', (t) => { t.categories[0].items[0].answer = 'yes'; }],
    ['a missing statement', (t) => { delete t.statement; }],
    ['a different statement', (t) => { t.statement = 'other'; }],
    ['version 0', (t) => { t.version = 0; }],
    ['a fractional version', (t) => { t.version = 1.5; }],
    ['a bad template id', (t) => { t.templateId = 'bad id'; }],
    ['an upper-case key', (t) => { t.categories[0].key = 'Cat-A'; }],
    ['an empty label', (t) => { t.categories[0].items[0].label = ''; }],
    ['a long label', (t) => { t.categories[0].items[0].label = 'x'.repeat(201); }],
    ['an unknown sensitivity', (t) => { t.categories[0].sensitivity = 'secret'; }],
    ['an unknown item type', (t) => { t.categories[0].items[0].type = 'number'; }],
    ['no categories', (t) => { t.categories = []; }],
    ['an empty category', (t) => { t.categories[0].items = []; }],
    ['too many tags', (t) => { t.categories[0].items[0].tags = Array.from({ length: 11 }, (_, i) => `t${i}`); }],
  ])('rejects %s', (_name, change) => {
    const raw = valid();
    change(raw);
    const result = validateTemplate(raw);
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('rejects a key used twice, even across a category and an item', () => {
    const raw = valid();
    raw.categories[1].items[0].key = 'item-a';
    expect(validateTemplate(raw).problems.join(' ')).toMatch(/"item-a" is used more than once/);

    const second = valid();
    second.categories[1].items[0].key = 'cat-a';
    expect(validateTemplate(second).ok).toBe(false);
  });

  it('rejects more items than a template may hold', () => {
    const raw = valid();
    raw.categories = Array.from({ length: 6 }, (_, c) => ({
      key: `c${c}`, name: `C${c}`, sensitivity: 'normal',
      items: Array.from({ length: TEMPLATE_LIMITS.itemsPerCategory }, (_i, i) => ({ key: `c${c}-i${i}`, label: `Item ${i}` })),
    }));
    expect(validateTemplate(raw).problems.join(' ')).toMatch(/limit is 300/);
  });

  it('requires restricted content to be hidden by default, and adult-intended content too (D-008, D-037)', () => {
    const raw = valid();
    raw.categories[0].sensitivity = 'restricted';
    expect(validateTemplate(raw).problems.join(' ')).toMatch(/hidden by default/);

    raw.defaultVisibility = 'hidden';
    expect(validateTemplate(raw).ok).toBe(true);

    const adult = valid();
    adult.adultIntended = true;
    expect(validateTemplate(adult).problems.join(' ')).toMatch(/hidden by default/);
    adult.defaultVisibility = 'hidden';
    expect(validateTemplate(adult).ok).toBe(true);
  });

  it('catches restricted content on a single item as well', () => {
    const raw = valid();
    raw.categories[0].items[0].sensitivity = 'restricted';
    expect(validateTemplate(raw).ok).toBe(false);
  });

  it('rejects things that are not objects', () => {
    for (const raw of [null, undefined, 'x', 3, []]) expect(validateTemplate(raw).ok).toBe(false);
  });
});

describe('buildCatalogue', () => {
  it('keeps the good templates and reports the bad ones by id', () => {
    const bad = valid();
    bad.templateId = 'sample-bad';
    bad.version = 0;
    const { templates, problems } = buildCatalogue([valid(), bad]);
    expect(templates.map((t) => t.templateId)).toEqual(['sample-one']);
    expect(problems.join(' ')).toMatch(/sample-bad/);
  });

  it('refuses a second template with the same id', () => {
    const { templates, problems } = buildCatalogue([valid(), valid()]);
    expect(templates).toHaveLength(1);
    expect(problems.join(' ')).toMatch(/used more than once/);
  });

  it('copes with entries that are not objects', () => {
    const { templates, problems } = buildCatalogue([null, valid()]);
    expect(templates).toHaveLength(1);
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe('summariseTemplate and originFor', () => {
  it('counts categories, items and sensitivity levels', () => {
    const { template } = validateTemplate(valid());
    expect(summariseTemplate(template)).toEqual({ categories: 2, items: 3, bySensitivity: { normal: 1, personal: 1, sensitive: 1, restricted: 0 } });
  });

  it('records the template id, version and key', () => {
    const { template } = validateTemplate({ ...valid(), version: 3 });
    expect(originFor(template, 'item-a')).toEqual({ templateId: 'sample-one', templateVersion: 3, key: 'item-a' });
  });

  it('normaliseTemplate leaves an already complete template as it is', () => {
    const once = validateTemplate(valid()).template;
    expect(normaliseTemplate(once)).toEqual(once);
  });
});
