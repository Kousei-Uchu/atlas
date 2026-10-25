// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';
import { loadProfile, listProfiles } from '../../src/storage/profile-repository.js';
import { effectiveStateId } from '../../src/domain/selectors.js';
import { getCycle } from '../../src/domain/state-cycle.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';

async function stored() {
  await waitFor(async () => expect(screen.getByText('Saved')).toBeTruthy());
  const [summary] = await listProfiles(db);
  return (await loadProfile(db, summary.id)).profile;
}

async function openPalette(user) {
  await user.click(screen.getByRole('button', { name: 'Edit palette' }));
  return screen.getByRole('region', { name: 'Answer palette' });
}

/** Labels of the states in the click-cycle list, in order. */
const cycleLabels = () => within(screen.getByRole('list', { name: 'States in the click cycle, in order' }))
  .getAllByRole('listitem')
  .map((li) => li.querySelector('.state-badge-label').textContent);

/** Labels of the states in the menu-only list. */
const menuOnlyLabels = () => within(screen.getByRole('list', { name: 'States that are only in the menu' }))
  .getAllByRole('listitem')
  .map((li) => li.querySelector('.state-badge-label').textContent);

/** The Meaning menu in the add-a-state form (an open editor has its own). */
const addFormMeaning = () => within(screen.getByRole('textbox', { name: 'Name of the new state' }).closest('form')).getByRole('combobox', { name: 'Meaning' });

const picker = () => screen.getAllByRole('combobox', { name: `Choose a state for ${HUG}` })[0];

describe('opening the palette', () => {
  it('is closed until asked for, then lists the cycle in order with fixed Unanswered', async () => {
    const { user } = await renderAtlas(db);
    expect(screen.queryByRole('list', { name: /click cycle/i })).toBeNull();
    const panel = await openPalette(user);
    expect(cycleLabels()).toEqual(['No', 'Unsure', 'Unanswered', 'Conditional', 'Yes']);
    expect(menuOnlyLabels()).toEqual(['Not applicable']);
    // Unanswered can be edited and moved, but not removed or taken out of the cycle.
    expect(within(panel).queryByRole('button', { name: 'Remove Unanswered' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Take out of cycle Unanswered' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Edit Unanswered' })).toBeTruthy();
  });

  it('has no serious or critical accessibility violations, with an editor open', async () => {
    const { user, container } = await renderAtlas(db);
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Edit Yes' }));
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe('renaming and restyling (I-03)', () => {
  it('changes how a state looks without changing the answer that uses it', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(picker(), 'Yes');
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Edit Yes' }));

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(name);
    await user.clear(name);
    await user.type(name, 'Happy to');
    fireEvent.change(screen.getByRole('textbox', { name: 'Background colour, as a hex code' }), { target: { value: '#112233' } });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Icon' }), 'Heart');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Pattern' }), 'Dots (dotted border)');
    await user.click(screen.getByRole('button', { name: 'Save changes to Yes' }));

    expect(screen.queryByRole('form', { name: 'Edit Yes' })).toBeNull();
    expect(stateButton(HUG).textContent).toBe('Happy to');
    const badge = stateButton(HUG).querySelector('.state-badge');
    expect(badge.getAttribute('data-pattern')).toBe('dots');

    const profile = await stored();
    expect(profile.answers).toEqual([{ itemId: 'starter_hug', stateId: 'yes', noteShareable: false }]);
    expect(profile.states.find((s) => s.id === 'yes')).toMatchObject({ label: 'Happy to', color: '#112233', icon: 'heart', pattern: 'dots' });
    expect(effectiveStateId(profile, 'starter_hug')).toBe('yes');
  });

  it('is one undo step', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Edit Yes' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Great');
    fireEvent.change(screen.getByRole('textbox', { name: 'Text and border colour, as a hex code' }), { target: { value: '#000000' } });
    await user.click(screen.getByRole('button', { name: 'Save changes to Yes' }));
    expect(cycleLabels()).toContain('Great');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(cycleLabels()).toContain('Yes');
    expect((await stored()).states.find((s) => s.id === 'yes')).toMatchObject({ label: 'Yes', textColor: '#FFFFFF' });
  });

  it('shows a readable message for a duplicate name and an invalid colour, and changes nothing', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Edit Yes' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'no');
    await user.click(screen.getByRole('button', { name: 'Save changes to Yes' }));
    expect(screen.getByRole('form', { name: 'Edit Yes' }).textContent).toMatch(/already called “No”/);
    expect(cycleLabels()).toContain('Yes');

    await user.clear(name);
    await user.type(name, 'Yes');
    fireEvent.change(screen.getByRole('textbox', { name: 'Background colour, as a hex code' }), { target: { value: '#12' } });
    await user.click(screen.getByRole('button', { name: 'Save changes to Yes' }));
    expect(screen.getByRole('form', { name: 'Edit Yes' }).textContent).toMatch(/colour like #1B5E20/);
  });

  it('closes on Escape and returns focus to the Edit button', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Edit Yes' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('form', { name: 'Edit Yes' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit Yes' })));
  });

  it('fixes the meaning of a built-in state', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Edit Unanswered' }));
    expect(within(screen.getByRole('form', { name: 'Edit Unanswered' })).getByRole('combobox', { name: 'Meaning' }).disabled).toBe(true);
  });
});

describe('cycle order', () => {
  it('moves a state, announces it, keeps focus, and clicking then follows the new order', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Move Yes earlier' }));
    expect(cycleLabels()).toEqual(['No', 'Unsure', 'Unanswered', 'Yes', 'Conditional']);
    expect(document.querySelector('[aria-live="polite"]').textContent).toMatch(/Yes moved earlier, now position 4 of 5/);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Yes earlier' }));

    // From Unanswered one positive step (right click) is now Yes, and still exactly one step.
    fireEvent.contextMenu(stateButton(HUG));
    expect(stateButton(HUG).textContent).toBe('Yes');
    expect(getCycle((await stored()).states).map((s) => s.id)).toEqual(['no', 'unsure', 'unanswered', 'yes', 'conditional']);
  });

  it('disables moving past either end', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    expect(screen.getByRole('button', { name: 'Move No earlier' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Move Yes later' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Move Yes earlier' }).disabled).toBe(false);
  });

  it('takes a state out of the cycle and puts it back at the end', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(picker(), 'Yes');
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Take out of cycle Yes' }));
    expect(cycleLabels()).toEqual(['No', 'Unsure', 'Unanswered', 'Conditional']);
    expect(stateButton(HUG).textContent).toBe('Yes'); // the answer is untouched
    expect(menuOnlyLabels()).toContain('Yes');
    await user.click(screen.getByRole('button', { name: 'Add to cycle Yes' }));
    expect(cycleLabels()).toEqual(['No', 'Unsure', 'Unanswered', 'Conditional', 'Yes']);
  });
});

describe('adding a state', () => {
  const fillAdd = async (user, name, { inCycle = false } = {}) => {
    await user.type(screen.getByRole('textbox', { name: 'Name of the new state' }), name);
    if (inCycle) await user.click(screen.getByRole('checkbox', { name: /Include it in the click cycle/ }));
    await user.click(screen.getByRole('button', { name: 'Add state' }));
  };

  it('adds a menu-only state, opens its editor, and answers nothing for anyone (I-01)', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await user.selectOptions(addFormMeaning(), 'Not sure');
    await fillAdd(user, 'Ask me first');
    expect(screen.getByRole('form', { name: 'Edit Ask me first' })).toBeTruthy();
    expect(menuOnlyLabels()).toContain('Ask me first');
    expect(cycleLabels()).toEqual(['No', 'Unsure', 'Unanswered', 'Conditional', 'Yes']);
    expect(within(picker()).getAllByRole('option').map((o) => o.textContent)).toContain('Ask me first');
    expect(screen.getAllByRole('button', { name: /: Unanswered$/ })).toHaveLength(7);
    const profile = await stored();
    expect(profile.answers).toEqual([]);
    expect(profile.states.at(-1)).toMatchObject({ label: 'Ask me first', semantic: 'uncertain', cycleOrder: null });
  });

  it('can join the cycle at the end', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await fillAdd(user, 'Love it', { inCycle: true });
    expect(cycleLabels()).toEqual(['No', 'Unsure', 'Unanswered', 'Conditional', 'Yes', 'Love it']);
  });

  it('refuses a name that clashes with an existing state, with a readable message', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await fillAdd(user, 'yes');
    expect((await screen.findByRole('alert')).textContent).toMatch(/already called “Yes”/);
    expect(cycleLabels()).toEqual(['No', 'Unsure', 'Unanswered', 'Conditional', 'Yes']);
  });
});

describe('removing a state', () => {
  /** Add "Maybe" (not sure, in the cycle) and answer the sample hug with it. */
  async function withMaybeAnswer(user) {
    await openPalette(user);
    await user.type(screen.getByRole('textbox', { name: 'Name of the new state' }), 'Maybe');
    await user.click(screen.getByRole('checkbox', { name: /Include it in the click cycle/ }));
    await user.selectOptions(addFormMeaning(), 'Not sure');
    await user.click(screen.getByRole('button', { name: 'Add state' }));
    await user.keyboard('{Escape}'); // close the editor that opens for the new state
    await user.selectOptions(picker(), 'Maybe');
    expect(stateButton(HUG).textContent).toBe('Maybe');
  }

  it('asks what to do, defaults to clearing, and only offers states that are not more permissive', async () => {
    const { user } = await renderAtlas(db);
    await withMaybeAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Remove Maybe' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/1 answer currently use this state/);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    const choice = within(dialog).getByRole('combobox', { name: 'What should happen to them?' });
    const options = within(choice).getAllByRole('option').map((o) => o.textContent);
    expect(choice.value).toBe('');
    expect(options[0]).toMatch(/^Clear them/);
    expect(options).toContain('Move them to “No”');
    expect(options).not.toContain('Move them to “Yes”');
    expect(options).not.toContain('Move them to “Conditional”');
    expect(options).not.toContain('Move them to “Unanswered”');
  });

  it('clears answers by default; undo brings back the state and the answer', async () => {
    const { user } = await renderAtlas(db);
    await withMaybeAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Remove Maybe' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove state' }));
    expect(cycleLabels()).not.toContain('Maybe');
    expect(stateButton(HUG).textContent).toBe('Unanswered');
    let profile = await stored();
    expect(profile.answers).toEqual([]);
    expect(profile.states.some((s) => s.label === 'Maybe')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stateButton(HUG).textContent).toBe('Maybe');
    profile = await stored();
    expect(profile.answers).toHaveLength(1);
    expect(profile.states.some((s) => s.label === 'Maybe')).toBe(true);
  });

  it('can move answers to a state that is not more permissive', async () => {
    const { user } = await renderAtlas(db);
    await withMaybeAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Remove Maybe' }));
    const dialog = screen.getByRole('alertdialog');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'What should happen to them?' }), 'Move them to “No”');
    await user.click(within(dialog).getByRole('button', { name: 'Remove state' }));
    expect(stateButton(HUG).textContent).toBe('No');
    expect((await stored()).answers).toEqual([{ itemId: 'starter_hug', stateId: 'no', noteShareable: false }]);
  });

  it('removes an unused state after a plain confirmation, and Escape cancels', async () => {
    const { user } = await renderAtlas(db);
    await openPalette(user);
    await user.click(screen.getByRole('button', { name: 'Remove Not applicable' }));
    let dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/No answers use this state/);
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Not applicable' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Remove Not applicable' }));
    dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove state' }));
    expect(screen.queryByRole('button', { name: 'Remove Not applicable' })).toBeNull();
    expect(within(picker()).getAllByRole('option').map((o) => o.textContent)).not.toContain('Not applicable');
  });

  it('keeps focus inside the dialog when tabbing through its three controls', async () => {
    const { user } = await renderAtlas(db);
    await withMaybeAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Remove Maybe' }));
    const dialog = screen.getByRole('alertdialog');
    // Order in the dialog: the choice, Cancel (focused on open), Remove state.
    await user.tab(); // Cancel -> Remove state
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Remove state' }));
    await user.tab(); // last wraps to the first control
    expect(document.activeElement).toBe(within(dialog).getByRole('combobox'));
    await user.tab({ shift: true }); // first wraps back to the last
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Remove state' }));
  });
});
