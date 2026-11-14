// @vitest-environment jsdom
// Inheritance (D-073) and the export family: a parent audience's override narrows what a child
// sees, never widens it, and neither the parent's name nor its reason reaches any export (I-11, R-05).
import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addCategory, addItem, setItemState } from '../../src/domain/commands.js';
import { addAudience, setOverride, setAudienceParent } from '../../src/domain/audience-commands.js';
import { addView } from '../../src/domain/view-commands.js';
import { buildExportModel } from '../../src/domain/export-model.js';
import { renderMarkdown } from '../../src/export/markdown.js';
import { renderCsv } from '../../src/export/csv.js';
import { renderHtml } from '../../src/export/html.js';
import { renderSvg } from '../../src/export/svg.js';

const NOW = '2026-11-14T10:00:00.000Z';
const must = (r) => { expect(r.ok, r.error).toBe(true); return r.profile; };
const PARENT = 'ZZ-parent-audience-name';
const REASON = 'ZZ-parent-reason';

function scenario(answer, parentState) {
  let p = createStarterProfile({ id: 'p1', title: 'T', now: NOW });
  p = { ...p, categories: [], items: [], answers: [] };
  p = must(addCategory(p, { id: 'cat_a', name: 'Things', sensitivity: 'normal' }, NOW));
  p = must(addItem(p, { id: 'item_a', categoryId: 'cat_a', label: 'An open item' }, NOW));
  p = must(setItemState(p, { itemId: 'item_a', stateId: answer }, NOW));
  p = must(addAudience(p, { id: 'aud_p', name: PARENT, type: 'family' }, NOW));
  p = must(addAudience(p, { id: 'aud_c', name: 'Cousins', type: 'family' }, NOW));
  p = must(setAudienceParent(p, { id: 'aud_c', parentId: 'aud_p' }, NOW));
  p = must(setOverride(p, { id: 'ov_p', itemId: 'item_a', audienceId: 'aud_p', stateId: parentState, explanation: REASON }, NOW));
  const q = must(addView(p, { id: 'view_1', name: 'For cousins', audienceId: 'aud_c' }, NOW));
  return { ...q, views: [{ ...q.views[0], includedItemIds: ['item_a'] }] };
}
const out = (p) => {
  const r = buildExportModel(p, p.views[0], { generatedAt: NOW });
  expect(r.ok, r.error).toBe(true);
  return { model: r.model, all: `${JSON.stringify(r.model)}\n${renderMarkdown(r.model)}\n${renderCsv(r.model)}\n${renderHtml(r.model)}\n${renderSvg(r.model).svg}` };
};

describe('exports for an audience that inherits', () => {
  it('shows the narrower inherited state and names neither the parent nor its reason', () => {
    const { all } = out(scenario('yes', 'no'));
    expect(all).toMatch(/\bNo\b/);
    expect(all).not.toContain(PARENT);
    expect(all).not.toContain(REASON);
    expect(all).not.toMatch(/inherit/i);
  });

  it('does not show a wider parent override: the child keeps the more private own answer', () => {
    const { all } = out(scenario('no', 'yes'));
    expect(all).toMatch(/\bNo\b/);
    expect(all).not.toMatch(/\bYes\b/);
    expect(all).not.toContain(PARENT);
    expect(all).not.toContain(REASON);
  });
});
