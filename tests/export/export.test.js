// @vitest-environment jsdom
// Export model and renderers (M4-06; I-02, I-09, I-11, D-044). The leak tests are the point:
// whatever the view holds back must not appear anywhere in the model, the Markdown or the SVG.
import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addCategory, addItem, setItemNote, setNoteShareable, setItemState, setItemText } from '../../src/domain/commands.js';
import { addAudience, setOverride } from '../../src/domain/audience-commands.js';
import { addView } from '../../src/domain/view-commands.js';
import { buildExportModel } from '../../src/domain/export-model.js';
import { renderMarkdown, mdEscape } from '../../src/export/markdown.js';
import { renderCsv, csvCell } from '../../src/export/csv.js';
import { renderHtml } from '../../src/export/html.js';
import { renderSvg, wrapText, xmlEscape } from '../../src/export/svg.js';
import { exportFilename } from '../../src/export/filename.js';
import { CONSENT_NOTICE } from '../../src/content/notices.js';

const NOW = '2026-10-31T10:00:00.000Z';
const must = (r) => { expect(r.ok, r.error).toBe(true); return r.profile; };

// Distinctive strings that must never appear unless the rule lets them.
const SECRET_ITEM = 'ZZ-restricted-item-label';
const SECRET_NOTE = 'ZZ-private-note-text';
const SECRET_SENSITIVE = 'ZZ-sensitive-item-label';
const SECRET_OTHER_AUDIENCE = 'ZZ-other-audience';
const SECRET_REASON = 'ZZ-override-reason';
const SECRET_TITLE = 'ZZ-profile-title';
const SHARED_NOTE = 'ZZ-shared-note-text';

function fixture() {
  let p = createStarterProfile({ id: 'p1', title: SECRET_TITLE, now: NOW });
  p = { ...p, categories: [], items: [], answers: [] };
  for (const level of ['normal', 'sensitive', 'restricted']) p = must(addCategory(p, { id: `cat_${level}`, name: `Category ${level}`, sensitivity: level }, NOW));
  p = must(addItem(p, { id: 'item_open', categoryId: 'cat_normal', label: 'An open item' }, NOW));
  p = must(addItem(p, { id: 'item_text', categoryId: 'cat_normal', label: 'Words', type: 'text' }, NOW));
  p = must(addItem(p, { id: 'item_sens', categoryId: 'cat_sensitive', label: SECRET_SENSITIVE }, NOW));
  p = must(addItem(p, { id: 'item_restr', categoryId: 'cat_restricted', label: SECRET_ITEM }, NOW));
  p = must(setItemState(p, { itemId: 'item_open', stateId: 'yes' }, NOW));
  p = must(setItemState(p, { itemId: 'item_sens', stateId: 'yes' }, NOW));
  p = must(setItemState(p, { itemId: 'item_restr', stateId: 'yes' }, NOW));
  p = must(setItemText(p, { itemId: 'item_text', text: 'Line one\nLine two' }, NOW));
  p = must(setItemNote(p, { itemId: 'item_restr', note: SECRET_NOTE }, NOW));
  p = must(setNoteShareable(p, { itemId: 'item_restr', shareable: true }, NOW));
  p = must(setItemNote(p, { itemId: 'item_open', note: SHARED_NOTE }, NOW));
  p = must(setNoteShareable(p, { itemId: 'item_open', shareable: true }, NOW));
  p = must(addAudience(p, { id: 'aud_1', name: 'Friends', type: 'friends' }, NOW));
  p = must(addAudience(p, { id: 'aud_2', name: SECRET_OTHER_AUDIENCE, type: 'family' }, NOW));
  p = must(setOverride(p, { id: 'ov_2', itemId: 'item_open', audienceId: 'aud_2', stateId: 'no', explanation: SECRET_REASON }, NOW));
  return p;
}
const withView = (p, over = {}) => {
  const q = must(addView(p, { id: 'view_1', name: 'For friends', audienceId: 'aud_1' }, NOW));
  return { ...q, views: [{ ...q.views[0], includedItemIds: ['item_open', 'item_text', 'item_sens', 'item_restr'], ...over }] };
};
const build = (p) => buildExportModel(p, p.views[0], { generatedAt: NOW });
const everything = (p) => {
  const { model } = build(p);
  const { svg } = renderSvg(model);
  return `${JSON.stringify(model)}\n${renderMarkdown(model)}\n${renderCsv(model)}\n${renderHtml(model)}\n${svg}`;
};

describe('buildExportModel: what is in it', () => {
  it('carries the included items only, grouped by category, with the audience, date and statement', () => {
    const { model } = build(withView(fixture()));
    expect(model).toMatchObject({ title: 'For friends', audience: 'Friends', date: '2026-10-31', statement: CONSENT_NOTICE, itemCount: 2 });
    expect(model.sections.map((s) => s.name)).toEqual(['Category normal']);
    expect(model.sections[0].items.map((i) => i.label)).toEqual(['An open item', 'Words']);
    expect(model.sections[0].items[0].state.label).toBe('Yes');
    expect(model.sections[0].items[1]).toMatchObject({ kind: 'text', text: 'Line one\nLine two', state: null });
  });

  it('lists in the legend only the states that appear, with their meaning', () => {
    const { model } = build(withView(fixture()));
    expect(model.legend.map((s) => s.label)).toEqual(['Yes']);
    expect(model.legend[0].description).toMatch(/comfortable/);
  });

  it('uses the audience\u2019s override and not the default for that audience, and the default when there is no audience', () => {
    let p = fixture();
    p = must(setOverride(p, { id: 'ov_1', itemId: 'item_open', audienceId: 'aud_1', stateId: 'conditional' }, NOW));
    expect(build(withView(p)).model.sections[0].items[0].state.label).toBe('Conditional');
    const none = { ...withView(p), views: [{ ...withView(p).views[0], audienceId: null }] };
    expect(build(none).model.sections[0].items[0].state.label).toBe('Yes');
    expect(build(none).model.audience).toBeNull();
  });

  it('shows Unanswered, never a yes, for an item with no answer', () => {
    let p = withView(fixture(), { includedItemIds: ['item_open'] });
    p = { ...p, answers: p.answers.filter((a) => a.itemId !== 'item_open') };
    const { model } = build(p);
    expect(model.sections[0].items[0].state.label).toBe('Unanswered');
    expect(model.legend.map((s) => s.label)).toEqual(['Unanswered']);
  });

  it('names a nested category with its parents', () => {
    let p = fixture();
    p = must(addCategory(p, { id: 'cat_child', name: 'Child', parentId: 'cat_normal' }, NOW));
    p = must(addItem(p, { id: 'item_child', categoryId: 'cat_child', label: 'Nested' }, NOW));
    const q = withView(p, { includedItemIds: ['item_child'] });
    expect(build(q).model.sections[0].name).toBe('Category normal / Child');
  });
});

describe('buildExportModel: what is refused', () => {
  it('refuses an empty view, a missing view and a missing audience', () => {
    expect(build(withView(fixture(), { includedItemIds: [] })).ok).toBe(false);
    expect(buildExportModel(fixture(), undefined, { generatedAt: NOW }).ok).toBe(false);
    expect(build(withView(fixture(), { audienceId: 'gone' })).error).toMatch(/audience/);
  });

  it('refuses while an included item has overrides that disagree, and succeeds once one is kept', () => {
    let p = fixture();
    p = { ...p, overrides: [
      { id: 'ov_a', itemId: 'item_open', audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: '' },
      { id: 'ov_b', itemId: 'item_open', audienceId: 'aud_1', stateId: 'no', enabled: true, explanation: '' },
    ] };
    const r = build(withView(p));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/disagree/);
    const fixed = must(setOverride(withView(p), { id: 'ov_c', itemId: 'item_open', audienceId: 'aud_1', stateId: 'no' }, NOW));
    expect(build(fixed).ok).toBe(true);
  });

  it('refuses a view in which everything is held back', () => {
    expect(build(withView(fixture(), { includedItemIds: ['item_sens', 'item_restr'] })).ok).toBe(false);
  });
});

describe('nothing held back leaks into the model, the Markdown or the SVG (I-11)', () => {
  it('leaves out sensitive and restricted items by default, with their notes, and everything else private', () => {
    const text = everything(withView(fixture()));
    for (const secret of [SECRET_ITEM, SECRET_NOTE, SECRET_SENSITIVE, SECRET_OTHER_AUDIENCE, SECRET_REASON, SECRET_TITLE]) {
      expect(text, secret).not.toContain(secret);
    }
    for (const id of ['item_', 'cat_', 'aud_', 'ov_', 'view_', 'p1']) expect(text, id).not.toMatch(new RegExp(`\\b${id}`));
  });

  it('includes a sensitive item only when the view allows it, and still not the restricted one', () => {
    const text = everything(withView(fixture(), { includeSensitive: true }));
    expect(text).toContain(SECRET_SENSITIVE);
    expect(text).not.toContain(SECRET_ITEM);
    expect(text).not.toContain(SECRET_NOTE);
  });

  it('includes a restricted item only with its own opt-in, and its note only when notes are on too', () => {
    const optedIn = withView(fixture(), { restrictedOptInItemIds: ['item_restr'] });
    const noNotes = everything(optedIn);
    expect(noNotes).toContain(SECRET_ITEM);
    expect(noNotes).not.toContain(SECRET_NOTE);
    expect(noNotes).not.toContain(SHARED_NOTE);
    const withNotes = everything({ ...optedIn, views: [{ ...optedIn.views[0], includeNotes: true }] });
    expect(withNotes).toContain(SECRET_NOTE);
    expect(withNotes).toContain(SHARED_NOTE);
  });

  it('never includes a note that is not marked shareable, whatever the view says', () => {
    let p = withView(fixture(), { includeNotes: true, restrictedOptInItemIds: ['item_restr'] });
    p = must(setNoteShareable(p, { itemId: 'item_restr', shareable: false }, NOW));
    const text = everything(p);
    expect(text).toContain(SECRET_ITEM);
    expect(text).not.toContain(SECRET_NOTE);
    expect(text).toContain(SHARED_NOTE);
  });

  it('holds back an item whose level was raised after it was picked', () => {
    let p = withView(fixture(), { includedItemIds: ['item_open', 'item_text'] });
    expect(everything(p)).toContain('An open item');
    p = { ...p, categories: p.categories.map((c) => (c.id === 'cat_normal' ? { ...c, sensitivity: 'restricted' } : c)) };
    expect(buildExportModel(p, p.views[0], { generatedAt: NOW }).ok).toBe(false);
  });

  it('holds back items in a hidden category', () => {
    let p = withView(fixture(), { includeSensitive: true });
    p = { ...p, categories: p.categories.map((c) => (c.id === 'cat_sensitive' ? { ...c, visibility: 'hidden' } : c)) };
    expect(everything(p)).not.toContain(SECRET_SENSITIVE);
  });
});

describe('every export carries the statement and a legend (I-02, I-09)', () => {
  const model = () => build(withView(fixture(), { includeNotes: true })).model;

  it('puts the statement in the Markdown at the top and the bottom, and a key', () => {
    const md = renderMarkdown(model());
    expect(md.split(`> ${CONSENT_NOTICE.replace(/[.]/g, '.')}`).length - 1).toBeGreaterThanOrEqual(2);
    expect(md).toContain('## How to read this');
    expect(md).toMatch(/- \*\*Yes\*\*: /);
    expect(md).toMatch(/- An open item: \*\*Yes\*\*/);
  });

  it('puts the statement and a legend with an icon word and a pattern word in the SVG', () => {
    const { svg } = renderSvg(model());
    expect(svg).toContain('A chart shows general preferences.');
    expect(svg).toContain('How to read this');
    expect(svg).toMatch(/tick, solid fill/);
    expect(svg).toContain('<title>For friends</title>');
    expect(svg).toMatch(/<desc>[^<]*not permission/);
  });
});

describe('Markdown escaping', () => {
  it('turns markup typed by the person into plain text', () => {
    const out = mdEscape('# Title [link](http://x) <b>bold</b> *em* `code` | cell\n- list\n1. one');
    expect(out).not.toMatch(/(^|\n)#/);
    expect(out).toContain('\\[link\\]');
    expect(out).not.toMatch(/(^|[^\\])\]\(/);
    expect(out).toContain('\\<b\\>');
    expect(out).toContain('\\*em\\*');
    expect(out).toContain('\\|');
    expect(out).toMatch(/\n\s*\\- list/);
    expect(out).toMatch(/\n\s*\\1\. one/);
  });

  it('cannot start a heading, list or raw HTML from a label, a note or written text', () => {
    let p = withView(fixture(), { includeNotes: true });
    p = must(addItem(p, { id: 'item_evil', categoryId: 'cat_normal', label: '# <script>alert(1)</script>' }, NOW));
    p = must(setItemNote(p, { itemId: 'item_evil', note: '<img src=x onerror=alert(1)>\n## Heading' }, NOW));
    p = must(setNoteShareable(p, { itemId: 'item_evil', shareable: true }, NOW));
    p = must(setItemState(p, { itemId: 'item_evil', stateId: 'no' }, NOW));
    p = { ...p, views: [{ ...p.views[0], includedItemIds: [...p.views[0].includedItemIds, 'item_evil'] }] };
    const md = renderMarkdown(build(p).model);
    // Every < is escaped, so nothing can become an HTML tag.
    expect(md).not.toMatch(/(^|[^\\])</);
    expect(md).not.toMatch(/^## Heading/m);
    expect(md).not.toMatch(/^# <|^# \\#/m);
    expect(md.split('\n').filter((l) => /^#{1,2} /.test(l))[0]).toBe('# For friends');
  });
});

describe('SVG output', () => {
  const parse = (svg) => new DOMParser().parseFromString(svg, 'image/svg+xml');

  it('is well-formed XML with a size, and is made only of plain shapes and text', () => {
    const { svg, width, height } = renderSvg(build(withView(fixture(), { includeNotes: true })).model);
    const doc = parse(svg);
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.getAttribute('width')).toBe(String(width));
    expect(Number(doc.documentElement.getAttribute('height'))).toBe(height);
    const tags = new Set([...doc.querySelectorAll('*')].map((e) => e.tagName));
    for (const allowed of tags) expect(['svg', 'title', 'desc', 'defs', 'pattern', 'rect', 'text', 'line', 'g', 'path', 'circle']).toContain(allowed);
  });

  it('has no script, link, image, foreign content, event handler, external reference or style import', () => {
    const { svg } = renderSvg(build(withView(fixture(), { includeNotes: true })).model);
    const withoutNamespace = svg.replace('xmlns="http://www.w3.org/2000/svg"', '');
    expect(withoutNamespace).not.toMatch(/<script|<image|<foreignObject|<a[ >]|<use|<style|xlink|href=|\son\w+=|https?:|@import/i);
    // The only url() references point at patterns inside the picture.
    for (const ref of svg.match(/url\([^)]*\)/g) ?? []) expect(ref).toMatch(/^url\(#p-(stripes|dots)\)$/);
  });

  it('escapes what the person typed, so it cannot break out of the picture', () => {
    let p = withView(fixture());
    p = must(addItem(p, { id: 'item_evil', categoryId: 'cat_normal', label: '"><script>alert(1)</script> & </text>' }, NOW));
    p = { ...p, views: [{ ...p.views[0], includedItemIds: ['item_evil'] }] };
    const { svg } = renderSvg(build(p).model);
    expect(parse(svg).querySelector('parsererror')).toBeNull();
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;');
    expect(parse(svg).querySelectorAll('script').length).toBe(0);
  });

  it('shows each state by words and an icon as well as colour, and uses a pattern for patterned states (I-09)', () => {
    let p = withView(fixture(), { includedItemIds: ['item_open', 'item_text'] });
    p = must(setItemState(p, { itemId: 'item_open', stateId: 'unsure' }, NOW)); // dotted
    const { svg } = renderSvg(build(p).model);
    expect(svg).toContain('>Unsure</text>');
    expect(svg).toContain('id="p-dots"');
    expect(svg).toContain('fill="url(#p-dots)"');
    expect(svg).toMatch(/<path d="M9 9\.5a3 3 0 1 1/); // the question mark icon
  });

  it('does not fall over on a very long unbroken label, a long note and written text', () => {
    let p = withView(fixture(), { includeNotes: true });
    p = must(addItem(p, { id: 'item_long', categoryId: 'cat_normal', label: 'x'.repeat(190) }, NOW));
    p = must(setItemNote(p, { itemId: 'item_long', note: 'word '.repeat(300) }, NOW));
    p = must(setNoteShareable(p, { itemId: 'item_long', shareable: true }, NOW));
    p = { ...p, views: [{ ...p.views[0], includedItemIds: [...p.views[0].includedItemIds, 'item_long'] }] };
    const { svg, height } = renderSvg(build(p).model);
    expect(parse(svg).querySelector('parsererror')).toBeNull();
    expect(height).toBeGreaterThan(600);
  });

  it('wraps text by words, splits an unbroken word, and keeps paragraphs', () => {
    expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four']);
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('a\nb', 10)).toEqual(['a', 'b']);
    expect(wrapText('', 10)).toEqual(['']);
    expect(xmlEscape('a<b>&"\'\u0001')).toBe('a&lt;b&gt;&amp;&quot;&apos;');
  });

  it('falls back to safe colours when a stored colour is not a plain hex value', () => {
    const { model } = build(withView(fixture()));
    const bad = { ...model, legend: model.legend.map((s) => ({ ...s, color: 'red" onload="x', textColor: 'javascript:1' })), sections: model.sections.map((sec) => ({ ...sec, items: sec.items.map((i) => (i.state ? { ...i, state: { ...i.state, color: 'red" onload="x', textColor: 'javascript:1' } } : i)) })) };
    const { svg } = renderSvg(bad);
    expect(svg).not.toMatch(/onload|javascript/);
  });
});

describe('file names', () => {
  it('uses plain letters and digits, a date, and the extension', () => {
    expect(exportFilename('For my Friends!', '2026-10-31', 'md')).toBe('atlas-for-my-friends-2026-10-31.md');
    expect(exportFilename('../../etc/passwd', '2026-10-31', 'svg')).toBe('atlas-etc-passwd-2026-10-31.svg');
    expect(exportFilename('\u3053\u3093\u306b\u3061\u306f', '2026-10-31', 'png')).toBe('atlas-view-2026-10-31.png');
    expect(exportFilename('x', 'bad', 'md')).toBe('atlas-x-undated.md');
  });
});

describe('CSV export (M8-01, D-068)', () => {
  const csv = (p) => renderCsv(build(p).model);

  it('has a byte-order mark, CRLF rows, a header, the answers, the legend and the consent statement twice', () => {
    const text = csv(withView(fixture()));
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('"Group","Item","Answer"\r\n');
    expect(text).toContain('"Category normal","An open item","Yes"');
    expect(text.split(CONSENT_NOTICE).length - 1).toBe(2);
    expect(text).toContain('"State","Meaning"');
  });

  it('adds a Note column only when notes are on and a shareable note is in the export, and never the private ones', () => {
    const off = csv(withView(fixture()));
    expect(off).not.toContain('"Note"');
    expect(off).not.toContain(SHARED_NOTE);
    const on = csv(withView(fixture(), { includeNotes: true }));
    expect(on).toContain('"Group","Item","Answer","Note"');
    expect(on).toContain(SHARED_NOTE);
    expect(on).not.toContain(SECRET_NOTE);
  });

  it('quotes commas, quotes and line breaks so the columns never shift', () => {
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(csvCell('line\r\nbreak')).toBe('"line\nbreak"');
  });

  it('defuses spreadsheet formulas in the person\'s own text, and only there', () => {
    for (const bad of ['=SUM(A1)', '+1', '-1', '@cmd', '\t=x', '\r=x', ' =x', '\n=x']) expect(csvCell(bad)).toMatch(/^"'/);
    expect(csvCell('Fine = text')).toBe('"Fine = text"');
    expect(csvCell('')).toBe('""');
    let p = withView(fixture());
    p = must(setItemText(p, { itemId: 'item_text', text: '=HYPERLINK("http://x","y")' }, NOW));
    const text = csv(p);
    expect(text).not.toMatch(/(^|,)"=/m);
    expect(text).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it('shows empty text as words and drops control characters', () => {
    let p = withView(fixture());
    p = must(setItemText(p, { itemId: 'item_text', text: '' }, NOW));
    expect(csv(p)).toContain('(nothing written)');
    expect(csvCell('a\u0000b\u0007c')).toBe('"abc"');
  });

  it('holds back what the view holds back, like every other format', () => {
    const text = csv(withView(fixture()));
    for (const secret of [SECRET_ITEM, SECRET_SENSITIVE, SECRET_OTHER_AUDIENCE, SECRET_REASON, SECRET_TITLE]) expect(text).not.toContain(secret);
  });

  it('names the file with the csv extension', () => {
    expect(exportFilename('For friends', '2026-10-31', 'csv')).toBe('atlas-for-friends-2026-10-31.csv');
  });
});

describe('standalone web page export (M8-03, D-070)', () => {
  const html = (p) => renderHtml(build(p).model);

  it('is a complete page with its own policy that forbids scripts, requests and forms', () => {
    const text = html(withView(fixture()));
    expect(text.startsWith('<!doctype html>')).toBe(true);
    expect(text).toContain("default-src 'none'");
    expect(text).toContain('<html lang="en">');
    expect(text).toContain('<title>For friends</title>');
    expect(text).toContain('<strong>Yes</strong>');
    expect(text.split(CONSENT_NOTICE).length - 1).toBe(2);
  });

  it('has no script, image, link, form, frame, event handler or address in it', () => {
    const text = html(withView(fixture(), { includeNotes: true }));
    expect(text).not.toMatch(/<(script|img|link|iframe|object|embed|form|input|a|svg|video|audio|source)[\s>]/i);
    expect(text).not.toMatch(/\son[a-z]+\s*=/i);
    expect(text).not.toMatch(/https?:|javascript:|data:|url\(|@import/i);
  });

  it('escapes the person\'s text so it can never become markup', () => {
    let p = withView(fixture());
    p = must(setItemText(p, { itemId: 'item_text', text: '<script>alert(1)</script> & "quotes" <img src=x onerror=y>' }, NOW));
    const text = html(p);
    expect(text).not.toContain('<script>alert');
    expect(text).not.toContain('<img');
    expect(text).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
    const base = withView(fixture());
    const titled = { ...base, views: [{ ...base.views[0], name: '</title><script>x</script>' }] };
    expect(renderHtml(build(titled).model)).not.toContain('<script>x');
  });

  it('shows empty text as words, keeps notes only when notes are on, and holds back what the view holds back', () => {
    let p = withView(fixture());
    p = must(setItemText(p, { itemId: 'item_text', text: '' }, NOW));
    expect(html(p)).toContain('(nothing written)');
    expect(html(withView(fixture()))).not.toContain(SHARED_NOTE);
    expect(html(withView(fixture(), { includeNotes: true }))).toContain(SHARED_NOTE);
    const text = html(withView(fixture(), { includeNotes: true }));
    for (const secret of [SECRET_ITEM, SECRET_SENSITIVE, SECRET_OTHER_AUDIENCE, SECRET_REASON, SECRET_TITLE, SECRET_NOTE]) expect(text).not.toContain(secret);
  });
});
