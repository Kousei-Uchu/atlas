// Share envelope, codec and fragment reader (M5-01; I-02, I-08, I-11; spec 11).
// Decoded data is hostile until proven otherwise, so most of this file is hostile input.
import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addCategory, addItem, setItemNote, setNoteShareable, setItemState, setItemText } from '../../src/domain/commands.js';
import { addAudience } from '../../src/domain/audience-commands.js';
import { addView } from '../../src/domain/view-commands.js';
import { buildExportModel } from '../../src/domain/export-model.js';
import { buildEnvelope, checkEnvelope } from '../../src/share/envelope.js';
import { encodePayload, decodePayload, toBase64Url, fromBase64Url, inflateWithBudget } from '../../src/share/codec.js';
import { readFragment, buildShareUrl, isSupportedVersion } from '../../src/share/fragment.js';
import { CONSENT_NOTICE } from '../../src/content/notices.js';
import { LIMITS } from '../../src/domain/limits.js';

const NOW = '2026-11-05T10:00:00.000Z';
const must = (r) => { if (!r.ok) throw new Error(r.error); return r.profile; };

function model() {
  let p = createStarterProfile({ id: 'p1', title: 'ZZPROFILETITLE', now: NOW });
  p = { ...p, categories: [], items: [], answers: [] };
  p = must(addCategory(p, { id: 'c1', name: 'Contact', sensitivity: 'normal' }, NOW));
  p = must(addCategory(p, { id: 'c2', name: 'Private', sensitivity: 'restricted' }, NOW));
  p = must(addItem(p, { id: 'i1', categoryId: 'c1', label: 'A hug' }, NOW));
  p = must(addItem(p, { id: 'i2', categoryId: 'c1', label: 'Words', type: 'text' }, NOW));
  p = must(addItem(p, { id: 'i3', categoryId: 'c2', label: 'ZZRESTRICTED' }, NOW));
  p = must(setItemState(p, { itemId: 'i1', stateId: 'yes' }, NOW));
  p = must(setItemState(p, { itemId: 'i3', stateId: 'yes' }, NOW));
  p = must(setItemText(p, { itemId: 'i2', text: 'Ask first\nthen hug' }, NOW));
  p = must(setItemNote(p, { itemId: 'i1', note: 'Only at greetings' }, NOW));
  p = must(setNoteShareable(p, { itemId: 'i1', shareable: true }, NOW));
  p = must(addAudience(p, { id: 'a1', name: 'ZZAUDIENCE', type: 'friends' }, NOW));
  p = must(addView(p, { id: 'v1', name: 'Guide for friends', audienceId: 'a1' }, NOW));
  const view = { ...p.views[0], includedItemIds: ['i1', 'i2', 'i3'], includeNotes: true };
  const built = buildExportModel(p, view, { generatedAt: NOW });
  expect(built.ok, built.error).toBe(true);
  return built.model;
}
const envelope = () => { const r = buildEnvelope(model(), { createdAt: NOW }); expect(r.ok, JSON.stringify(r.problems)).toBe(true); return r.envelope; };

// Compress arbitrary bytes the same way the codec does, for building hostile payloads.
async function rawPayload(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}
const jsonPayload = (value) => rawPayload(new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)));
const codeOf = (r) => (r.ok ? 'ok' : r.error.code);

describe('the envelope holds only what the model held (I-11)', () => {
  it('has the format, title, date, states, groups and the fixed statement, and no ids or audience', () => {
    const e = envelope();
    expect(e).toMatchObject({ format: 'atlas-share', title: 'Guide for friends', createdAt: NOW, includesNotes: true, statement: CONSENT_NOTICE });
    const text = JSON.stringify(e);
    for (const never of ['ZZPROFILETITLE', 'ZZAUDIENCE', 'ZZRESTRICTED', '"i1"', '"c1"', 'a1', 'v1']) expect(text.includes(never), never).toBe(false);
    expect(e.groups).toHaveLength(1);
    expect(e.groups[0].items.map((i) => i.label)).toEqual(['A hug', 'Words']);
  });

  it('refers to states by position, lists only the states used, and keeps text and note', () => {
    const e = envelope();
    expect(e.states.map((s) => s.label)).toEqual(['Yes']);
    expect(e.groups[0].items[0]).toEqual({ label: 'A hug', kind: 'state', state: 0, text: null, note: 'Only at greetings' });
    expect(e.groups[0].items[1]).toEqual({ label: 'Words', kind: 'text', state: null, text: 'Ask first\nthen hug', note: null });
  });
});

describe('round trip', () => {
  it('encodes and decodes to the same envelope, in a payload of the allowed alphabet', async () => {
    const e = envelope();
    const enc = await encodePayload(e);
    expect(enc.ok).toBe(true);
    expect(enc.payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const dec = await decodePayload(enc.payload);
    expect(dec).toEqual({ ok: true, envelope: e });
  });

  it('is small for a small chart', async () => {
    const enc = await encodePayload(envelope());
    expect(enc.payload.length).toBeLessThan(2048);
  });

  it('refuses to encode something that is not a valid envelope', async () => {
    const r = await encodePayload({ ...envelope(), statement: 'Everything here is consent.' });
    expect(codeOf(r)).toBe('not-a-chart');
  });
});

describe('hostile payloads are refused with a plain reason (I-08)', () => {
  it('refuses an oversize encoded payload before decoding it', async () => {
    expect(codeOf(await decodePayload('A'.repeat(LIMITS.shareEncodedBytes + 1)))).toBe('too-large');
  });

  it('stops a small payload that expands past the budget, without reading it all', async () => {
    const bomb = await rawPayload(new Uint8Array(LIMITS.shareDecompressedBytes * 3)); // zeros: compresses to a few KB
    expect(bomb.length).toBeLessThan(LIMITS.shareEncodedBytes);
    expect(codeOf(await decodePayload(bomb))).toBe('too-big-when-opened');
  });

  it('counts the budget in bytes of output, so a lower budget stops a normal chart', async () => {
    const enc = await encodePayload(envelope());
    expect(codeOf(await decodePayload(enc.payload, { maxDecoded: 50 }))).toBe('too-big-when-opened');
    expect(codeOf(await decodePayload(enc.payload, { maxEncoded: 10 }))).toBe('too-large');
  });

  it('refuses characters outside base64url, padding, and a length that cannot be real', async () => {
    for (const bad of ['abc+def', 'abc/def', 'abc=', 'ab cd', 'a<b>', 'é', 'A', '']) expect(codeOf(await decodePayload(bad)), JSON.stringify(bad)).toBe('bad-encoding');
  });

  it('refuses a truncated payload and bytes that are not deflate data', async () => {
    const enc = await encodePayload(envelope());
    expect(['bad-compression', 'bad-encoding', 'not-text', 'not-json']).toContain(codeOf(await decodePayload(enc.payload.slice(0, Math.floor(enc.payload.length / 2)))));
    expect(codeOf(await decodePayload(toBase64Url(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))))).toBe('bad-compression');
  });

  it('refuses text that is not valid UTF-8, and text that is not JSON', async () => {
    expect(codeOf(await decodePayload(await rawPayload(new Uint8Array([0xff, 0xfe, 0xfd]))))).toBe('not-text');
    expect(codeOf(await decodePayload(await jsonPayload('not json at all')))).toBe('not-json');
  });

  it('refuses reserved keys anywhere, however deep', async () => {
    const e = envelope();
    expect(codeOf(await decodePayload(await jsonPayload('{"__proto__":{"x":1},"format":"atlas-share"}')))).toBe('forbidden-key');
    const nested = JSON.stringify({ ...e, groups: [{ name: 'A', items: [{ label: 'x', kind: 'text', state: null, text: 't', note: null, constructor: { prototype: {} } }] }] });
    expect(codeOf(await decodePayload(await jsonPayload(nested)))).toBe('forbidden-key');
  });

  it('refuses nesting that is too deep without overflowing the stack', async () => {
    const deep = `${'['.repeat(5000)}${']'.repeat(5000)}`;
    expect(['too-deep', 'not-json']).toContain(codeOf(await decodePayload(await jsonPayload(deep))));
    const modest = JSON.stringify({ a: JSON.parse(`${'['.repeat(30)}${']'.repeat(30)}`) });
    expect(codeOf(await decodePayload(await jsonPayload(modest)))).toBe('too-deep');
  });

  it('does not pollute Object.prototype', async () => {
    await decodePayload(await jsonPayload('{"__proto__":{"polluted":true}}'));
    expect({}.polluted).toBeUndefined();
  });

  it('refuses extra fields, a missing field, the wrong format name and a different statement', async () => {
    const e = envelope();
    for (const [name, bad] of [
      ['extra top field', { ...e, extra: 1 }],
      ['extra item field', { ...e, groups: [{ name: 'A', items: [{ ...e.groups[0].items[0], id: 'x' }] }] }],
      ['missing title', Object.fromEntries(Object.entries(e).filter(([key]) => key !== 'title'))],
      ['wrong format', { ...e, format: 'something-else' }],
      ['changed statement', { ...e, statement: 'This chart is your permission.' }],
      ['no groups', { ...e, groups: [] }],
      ['bad date', { ...e, createdAt: 'yesterday' }],
    ]) expect(codeOf(await decodePayload(await jsonPayload(bad))), name).toBe('not-a-chart');
  });

  it('refuses a state reference that points nowhere, and a state item without a state', async () => {
    const e = envelope();
    const point = (state) => ({ ...e, groups: [{ name: 'A', items: [{ label: 'x', kind: 'state', state, text: null, note: null }] }] });
    expect(codeOf(await decodePayload(await jsonPayload(point(5))))).toBe('not-a-chart');
    expect(codeOf(await decodePayload(await jsonPayload(point(null))))).toBe('not-a-chart');
    expect(codeOf(await decodePayload(await jsonPayload(point(-1))))).toBe('not-a-chart');
  });

  it('refuses notes in an envelope that says it has none', async () => {
    const e = { ...envelope(), includesNotes: false };
    expect(codeOf(await decodePayload(await jsonPayload(e)))).toBe('not-a-chart');
  });

  it('refuses colours that are not plain hex, unknown icons and patterns', async () => {
    const e = envelope();
    for (const change of [{ color: 'red' }, { color: 'url(javascript:alert(1))' }, { textColor: '#FFF' }, { icon: 'skull' }, { pattern: 'image' }, { semantic: 'x' }]) {
      expect(codeOf(await decodePayload(await jsonPayload({ ...e, states: [{ ...e.states[0], ...change }] }))), JSON.stringify(change)).toBe('not-a-chart');
    }
  });

  it('refuses text and counts over the limits', async () => {
    const e = envelope();
    const long = (n) => 'x'.repeat(n);
    const item = e.groups[0].items[1];
    expect(codeOf(await decodePayload(await jsonPayload({ ...e, title: long(LIMITS.titleLength + 1) })))).toBe('not-a-chart');
    expect(codeOf(await decodePayload(await jsonPayload({ ...e, groups: [{ name: 'A', items: [{ ...item, label: long(LIMITS.labelLength + 1) }] }] })))).toBe('not-a-chart');
    expect(codeOf(await decodePayload(await jsonPayload({ ...e, groups: [{ name: 'A', items: [{ ...item, text: long(LIMITS.textLength + 1) }] }] })))).toBe('not-a-chart');
    const many = Array.from({ length: LIMITS.items + 1 }, () => item);
    expect(codeOf(await decodePayload(await jsonPayload({ ...e, groups: [{ name: 'A', items: many }] })))).toBe('not-a-chart');
  });

  it('keeps markup as plain text and strips control characters', async () => {
    const e = envelope();
    const payload = await jsonPayload({ ...e, title: '<img src=x onerror=alert(1)>\u0000\u0007ok', groups: [{ name: 'A', items: [{ label: '<script>x</script>\u001b', kind: 'text', state: null, text: '\u0000t', note: null }] }] });
    const r = await decodePayload(payload);
    expect(r.ok).toBe(true);
    expect(r.envelope.title).toBe('<img src=x onerror=alert(1)>ok');
    expect(r.envelope.groups[0].items[0]).toMatchObject({ label: '<script>x</script>', text: 't' });
  });

  it('never throws, whatever it is given', async () => {
    for (const input of [undefined, null, 42, {}, [], 'x'.repeat(10), '%%%', 'A'.repeat(4097)]) {
      const r = await decodePayload(input);
      expect(r.ok).toBe(false);
      expect(typeof r.error.message).toBe('string');
    }
  });

  it('inflateWithBudget stops at the budget and reports bad data', async () => {
    const bytes = fromBase64Url(await rawPayload(new Uint8Array(100_000)));
    expect((await inflateWithBudget(bytes, 1000)).code).toBe('too-big-when-opened');
    expect((await inflateWithBudget(bytes, 200_000)).ok).toBe(true);
    expect((await inflateWithBudget(new Uint8Array([9, 9, 9, 9]), 1000)).code).toBe('bad-compression');
  });
});

describe('base64url', () => {
  it('round-trips every length, and rejects what is not canonical', () => {
    for (let n = 0; n < 40; n += 1) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) % 256);
      const text = toBase64Url(bytes);
      expect(text).not.toMatch(/[+/=]/);
      expect([...fromBase64Url(text)]).toEqual([...bytes]);
    }
    expect(fromBase64Url('a')).toBeNull();
    expect(fromBase64Url('a+b')).toBeNull();
  });
});

describe('the fragment (D-017)', () => {
  it('reads #atlas=<version>.<payload> with or without the #', () => {
    expect(readFragment('#atlas=1.abc_-9')).toEqual({ kind: 'share', version: '1', payload: 'abc_-9' });
    expect(readFragment('atlas=1.abc')).toEqual({ kind: 'share', version: '1', payload: 'abc' });
  });
  it('says none when there is nothing for the app, and broken when it is half there', () => {
    for (const none of ['', '#', '#section', '#other=1.abc', undefined, null]) expect(readFragment(none).kind, String(none)).toBe('none');
    for (const broken of ['#atlas=', '#atlas=1', '#atlas=1.', '#atlas=.abc', '#atlas=abc']) expect(readFragment(broken).kind, broken).toBe('broken');
  });
  it('knows only version 1', () => {
    expect(isSupportedVersion('1')).toBe(true);
    for (const v of ['0', '2', '', '01', 'one']) expect(isSupportedVersion(v), v).toBe(false);
  });
  it('builds the link at the page address with no query or old fragment', () => {
    const url = buildShareUrl('https://example.test/atlas/?x=1#old', 'PAY');
    expect(url).toBe('https://example.test/atlas/#atlas=1.PAY');
    expect(readFragment(new URL(url).hash)).toEqual({ kind: 'share', version: '1', payload: 'PAY' });
  });
});

describe('checkEnvelope never hands back the input', () => {
  it('returns a cleaned copy', () => {
    const e = envelope();
    const r = checkEnvelope(e);
    expect(r.ok).toBe(true);
    expect(r.envelope).not.toBe(e);
    expect(r.envelope).toEqual(e);
  });
});
