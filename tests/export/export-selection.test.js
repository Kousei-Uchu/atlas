// Export-selection leak tests (M4-08; I-01, I-04, I-11). The fixed tests in export.test.js check named cases.
// This file checks the rule itself: many random profiles and views, and an oracle written from the rule
// in plain words, separate from evaluateView, decides which canary strings may appear in any output.
import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addCategory, addItem, setItemNote, setNoteShareable, setItemState, setItemText } from '../../src/domain/commands.js';
import { addAudience, setOverride } from '../../src/domain/audience-commands.js';
import { addView } from '../../src/domain/view-commands.js';
import { buildExportModel } from '../../src/domain/export-model.js';
import { renderMarkdown } from '../../src/export/markdown.js';
import { renderSvg } from '../../src/export/svg.js';

const NOW = '2026-11-04T10:00:00.000Z';
const must = (r) => { if (!r.ok) throw new Error(r.error); return r.profile; };
const LEVELS = ['normal', 'personal', 'sensitive', 'restricted'];
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));

/** Small seeded generator, so a failure can be replayed from its seed. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scenario(seed) {
  const r = rng(seed);
  const chance = (p) => r() < p;
  const pick = (list) => list[Math.floor(r() * list.length)];
  let p = createStarterProfile({ id: 'p1', title: 'ZZTITLE', now: NOW });
  p = { ...p, categories: [], items: [], answers: [] };
  const cats = [];
  const catCount = 2 + Math.floor(r() * 3);
  for (let c = 0; c < catCount; c += 1) {
    const level = pick(LEVELS);
    const id = `cat_${c}`;
    p = must(addCategory(p, { id, name: `Cat${c}`, sensitivity: level }, NOW));
    if (chance(0.25)) p = { ...p, categories: p.categories.map((x) => (x.id === id ? { ...x, visibility: 'hidden' } : x)) };
    cats.push(id);
  }
  p = must(addAudience(p, { id: 'aud_a', name: 'AudA', type: 'friends' }, NOW));
  p = must(addAudience(p, { id: 'aud_b', name: 'ZZOTHERAUD', type: 'family' }, NOW));

  const items = [];
  const itemCount = 4 + Math.floor(r() * 8);
  for (let n = 0; n < itemCount; n += 1) {
    const id = `item_${n}`;
    const text = chance(0.2);
    p = must(addItem(p, { id, categoryId: pick(cats), label: `ZZL${n}x`, type: text ? 'text' : 'state', sensitivity: pick(LEVELS) }, NOW));
    if (text) p = must(setItemText(p, { itemId: id, text: `ZZT${n}x` }, NOW));
    else if (chance(0.8)) p = must(setItemState(p, { itemId: id, stateId: pick(['yes', 'no', 'unsure', 'conditional']) }, NOW));
    const note = chance(0.6);
    if (note) {
      p = must(setItemNote(p, { itemId: id, note: `ZZN${n}x` }, NOW));
      if (chance(0.6)) p = must(setNoteShareable(p, { itemId: id, shareable: true }, NOW));
    }
    if (!text && chance(0.3)) p = must(setOverride(p, { id: `ov_b${n}`, itemId: id, audienceId: 'aud_b', stateId: 'no', explanation: `ZZREASON${n}x` }, NOW));
    items.push(id);
  }
  p = must(addView(p, { id: 'view_1', name: 'V', audienceId: 'aud_a' }, NOW));
  const picked = items.filter(() => chance(0.7));
  const optIns = picked.filter(() => chance(0.3));
  const view = {
    ...p.views[0], includedItemIds: picked, restrictedOptInItemIds: optIns,
    includeSensitive: chance(0.5), includeNotes: chance(0.5),
  };
  return { ...p, views: [view] };
}

/** The rule in plain words, written from the spec and not from evaluateView. */
function mayShow(p, view, itemId) {
  const item = p.items.find((i) => i.id === itemId);
  if (!view.includedItemIds.includes(itemId)) return false;
  const cat = p.categories.find((c) => c.id === item.categoryId);
  if (cat.visibility !== 'visible') return false;
  const level = LEVELS[Math.max(RANK[item.sensitivity], RANK[cat.sensitivity])];
  if (level === 'sensitive') return view.includeSensitive === true;
  if (level === 'restricted') return view.restrictedOptInItemIds.includes(itemId);
  return true;
}
const mayShowNote = (p, view, itemId) => {
  const a = p.answers.find((x) => x.itemId === itemId);
  return mayShow(p, view, itemId) && view.includeNotes === true && a?.noteShareable === true && !!a?.note;
};

describe('the export shows exactly what the rule allows, over many random views (I-11)', () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i + 1);
  it.each(seeds)('seed %i', (seed) => {
    const p = scenario(seed);
    const view = p.views[0];
    const built = buildExportModel(p, view, { generatedAt: NOW });
    const allowed = p.items.filter((i) => mayShow(p, view, i.id));
    if (allowed.length === 0) { expect(built.ok, 'nothing to show').toBe(false); return; }
    expect(built.ok, built.error).toBe(true);
    const out = `${JSON.stringify(built.model)}\n${renderMarkdown(built.model)}\n${renderSvg(built.model).svg}`;

    for (const item of p.items) {
      const n = item.id.split('_')[1];
      const shown = mayShow(p, view, item.id);
      expect(out.includes(`ZZL${n}x`), `${item.id} label (seed ${seed})`).toBe(shown);
      expect(out.includes(`ZZN${n}x`), `${item.id} note (seed ${seed})`).toBe(mayShowNote(p, view, item.id));
      if (item.type === 'text') expect(out.includes(`ZZT${n}x`), `${item.id} text (seed ${seed})`).toBe(shown);
      expect(out.includes(`ZZREASON${n}x`), 'override reasons of other audiences').toBe(false);
    }
    for (const never of ['ZZOTHERAUD', 'ZZTITLE', 'item_', 'cat_', 'aud_', 'ov_']) expect(out.includes(never), `${never} (seed ${seed})`).toBe(false);
    expect(built.model.itemCount).toBe(allowed.length);
  });

  it('does not change the profile it was given (I-04, I-05)', () => {
    const p = scenario(7);
    const before = JSON.stringify(p);
    const built = buildExportModel(p, p.views[0], { generatedAt: NOW });
    if (built.ok) { renderMarkdown(built.model); renderSvg(built.model); }
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('snapshots never leave in any output (M7-03, D-063)', () => {
  it('keeps snapshot names and entries out of the model, Markdown and SVG', async () => {
    const { takeSnapshot } = await import('../../src/domain/snapshot-commands.js');
    let p = createStarterProfile({ id: 'profile_s', title: 'Mine', now: NOW });
    const itemId = p.items.find((i) => i.type === 'state').id;
    p = must(setItemState(p, { itemId, stateId: 'yes' }, NOW));
    p = must(takeSnapshot(p, { id: 'snapshot_canary', label: 'SNAPSHOTCANARY' }, NOW));
    p = must(addView(p, { id: 'view_a', name: 'All' }, NOW));
    p = { ...p, views: [{ ...p.views[0], includedItemIds: [itemId] }] };
    const built = buildExportModel(p, p.views[0], { generatedAt: NOW });
    expect(built.ok, built.error).toBe(true);
    const out = `${JSON.stringify(built.model)}\n${renderMarkdown(built.model)}\n${renderSvg(built.model).svg}`;
    expect(out).not.toContain('SNAPSHOTCANARY');
    expect(out).not.toContain('snapshot_canary');
  });
});
