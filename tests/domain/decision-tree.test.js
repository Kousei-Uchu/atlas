import { describe, expect, it } from 'vitest';
import { decisionTree } from '../../src/domain/decision-tree.js';
import { addModule } from '../../src/domain/module-commands.js';
import { setItemState, setItemText } from '../../src/domain/commands.js';
import { getTemplate } from '../../src/content/templates/index.js';
import { createBlankProfile } from '../../src/domain/defaults.js';

const NOW = '2026-11-10T00:00:00.000Z';
const blank = () => createBlankProfile({ id: 'prof_a', title: 'T', now: NOW });
const withPlan = (visibility = 'visible') => {
  const r = addModule(blank(), { template: getTemplate('overwhelm-plan'), visibility, acknowledgeAdult: true }, NOW);
  expect(r.ok).toBe(true);
  return r.profile;
};
const item = (p, key) => p.items.find((i) => i.origin?.key === key);

describe('decision tree', () => {
  it('is null until the plan is on, and for a hidden plan or another module', () => {
    expect(decisionTree(blank())).toBeNull();
    expect(decisionTree(withPlan('hidden'))).toBeNull();
    const other = addModule(blank(), { template: getTemplate('personal-space'), visibility: 'visible', acknowledgeAdult: true }, NOW).profile;
    expect(decisionTree(other)).toBeNull();
  });

  it('starts with every branch empty and no leaves, in the plan order', () => {
    const tree = decisionTree(withPlan());
    expect(tree.leafCount).toBe(0);
    expect(tree.branches.map((b) => b.category.origin.key)).toEqual(['plan-signs', 'plan-helps', 'plan-others', 'plan-after']);
    expect(tree.branches.every((b) => b.empty)).toBe(true);
  });

  it('shows written text and answered states, never Unanswered, and ignores blank text', () => {
    let p = withPlan();
    const yes = p.states.find((s) => s.label === 'Yes');
    p = setItemText(p, { itemId: item(p, 'signs-feel').id, text: 'Loud rooms' }, NOW).profile;
    p = setItemText(p, { itemId: item(p, 'signs-do').id, text: '   ' }, NOW).profile;
    p = setItemState(p, { itemId: item(p, 'others-ask').id, stateId: yes.id }, NOW).profile;
    const tree = decisionTree(p);
    const signs = tree.branches[0];
    expect(signs.texts.map((t) => t.text)).toEqual(['Loud rooms']);
    const others = tree.branches[2];
    expect(others.groups).toHaveLength(1);
    expect(others.groups[0].state.id).toBe(yes.id);
    expect(others.groups[0].items.map((i) => i.origin.key)).toEqual(['others-ask']);
    expect(tree.leafCount).toBe(2);
    expect(JSON.stringify(tree)).not.toMatch(/score|total|suggest/i);
  });

  it('does not change the profile', () => {
    const p = withPlan();
    const before = JSON.stringify(p);
    decisionTree(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});
