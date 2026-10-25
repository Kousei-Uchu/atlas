// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';
import { loadProfile, listProfiles } from '../../src/storage/profile-repository.js';
import { getAnswer } from '../../src/domain/selectors.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';
const FIVE = 'A high five';
const TEXT = 'Being contacted by text';
const CONTACT = 'Sample: Physical contact';
const COMM = 'Sample: Communication';

const box = (label) => screen.getByRole('checkbox', { name: `Select ${label}` });
const bulk = () => screen.getByRole('region', { name: 'Bulk actions' });
const count = () => bulk().querySelector('.bulk-count').textContent;
const dialog = () => screen.getByRole('alertdialog');

async function startSelecting(user) {
  await user.click(screen.getByRole('button', { name: 'Select items' }));
}
async function pick(user, ...labels) {
  for (const label of labels) await user.click(box(label));
}
async function stored() {
  await waitFor(async () => expect(screen.getByText('Saved')).toBeTruthy());
  const [summary] = await listProfiles(db);
  return (await loadProfile(db, summary.id)).profile;
}
const itemsIn = (heading) => [...document.querySelector(`section[aria-labelledby="heading-${heading}"]`).querySelectorAll(':scope > .item-list > .item-row .item-label')].map((n) => n.textContent);

describe('selecting items (M2-07)', () => {
  it('shows no checkboxes until selecting is turned on', async () => {
    const { user } = await renderAtlas(db);
    expect(screen.queryAllByRole('checkbox', { name: /^Select / })).toHaveLength(0);
    await startSelecting(user);
    expect(screen.getAllByRole('checkbox', { name: /^Select / })).toHaveLength(7);
    expect(count()).toBe('No items selected.');
  });

  it('counts the selection, and every bulk action needs one', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    expect(screen.getByRole('button', { name: 'Change notes…' }).disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText('Set selected to'), 'No');
    expect(screen.getByRole('button', { name: 'Set state…' }).disabled).toBe(true);
    await pick(user, HUG, FIVE);
    expect(count()).toBe('2 items selected.');
    expect(screen.getByRole('button', { name: 'Set state…' }).disabled).toBe(false);
  });

  it('Select all shown follows the filter, and Clear selection empties it', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'contacted');
    await user.click(screen.getByRole('button', { name: 'Select all shown' }));
    expect(count()).toBe('2 items selected.');
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(count()).toBe('No items selected.');
  });

  it('leaves items alone that were selected and then hidden by a filter', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG);
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'phone');
    expect(count()).toContain('No items selected.');
    expect(count()).toContain('1 more is selected but hidden by the filter');
    expect(screen.getByRole('button', { name: 'Set state…' }).disabled).toBe(true);
  });

  it('turning selecting off removes the checkboxes and the selection', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG);
    await user.click(screen.getByRole('button', { name: 'Stop selecting' }));
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
    await startSelecting(user);
    expect(count()).toBe('No items selected.');
  });
});

describe('bulk state (M2-07)', () => {
  it('asks first, says how many change, then sets them in one undo step', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG, FIVE);
    await user.selectOptions(screen.getByLabelText('Set selected to'), 'No');
    await user.click(screen.getByRole('button', { name: 'Set state…' }));
    expect(within(dialog()).getByText(/This sets 2 items to “No”/)).toBeTruthy();
    expect(stateButton(HUG).textContent).toBe('Unanswered');
    await user.click(within(dialog()).getByRole('button', { name: 'Set 2 items' }));
    expect(stateButton(HUG).textContent).toBe('No');
    expect(stateButton(FIVE).textContent).toBe('No');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stateButton(HUG).textContent).toBe('Unanswered');
    expect(stateButton(FIVE).textContent).toBe('Unanswered');
  });

  it('Cancel and Escape change nothing', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG);
    await user.selectOptions(screen.getByLabelText('Set selected to'), 'No');
    await user.click(screen.getByRole('button', { name: 'Set state…' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(stateButton(HUG).textContent).toBe('Unanswered');
    await user.click(screen.getByRole('button', { name: 'Set state…' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(stateButton(HUG).textContent).toBe('Unanswered');
  });

  it('reminds the person that a saved yes is not consent', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG);
    await user.selectOptions(screen.getByLabelText('Set selected to'), 'Yes');
    await user.click(screen.getByRole('button', { name: 'Set state…' }));
    expect(within(dialog()).getByText(/never consent/)).toBeTruthy();
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await user.selectOptions(screen.getByLabelText('Set selected to'), 'No');
    await user.click(screen.getByRole('button', { name: 'Set state…' }));
    expect(within(dialog()).queryByText(/never consent/)).toBeNull();
  });

  it('says so, without a dialog, when nothing would change', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG);
    await user.selectOptions(screen.getByLabelText('Set selected to'), 'Unanswered');
    await user.click(screen.getByRole('button', { name: 'Set state…' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(document.querySelector('[role="status"][aria-live="polite"]').textContent).toContain('No change'));
  });

  it('is saved', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG, FIVE);
    await user.selectOptions(screen.getByLabelText('Set selected to'), 'Conditional');
    await user.click(screen.getByRole('button', { name: 'Set state…' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Set 2 items' }));
    const profile = await stored();
    expect(profile.answers.map((a) => a.stateId)).toEqual(['conditional', 'conditional']);
  });
});

describe('bulk move (M2-07)', () => {
  it('moves the selected items to another category after confirming', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG, FIVE);
    await user.selectOptions(screen.getByLabelText('Move selected to'), COMM);
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    expect(within(dialog()).getByText(/moves 2 items to the end of “Sample: Communication”/)).toBeTruthy();
    await user.click(within(dialog()).getByRole('button', { name: 'Move 2 items' }));
    expect(itemsIn('starter_communication')).toEqual([TEXT, 'Being contacted by phone call', 'Getting notice before a change of plans', HUG, FIVE]);
    expect(itemsIn('starter_contact')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(itemsIn('starter_contact')).toHaveLength(4);
  });

  it('keeps answers on moved items', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG));
    await startSelecting(user);
    await pick(user, HUG);
    await user.selectOptions(screen.getByLabelText('Move selected to'), COMM);
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Move 1 item' }));
    expect(stateButton(HUG).textContent).toBe('Unsure');
  });

  it('offers only visible categories', async () => {
    const names = [CONTACT, COMM];
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    const options = within(screen.getByLabelText('Move selected to')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Choose a category', ...names]);
  });
});

describe('bulk notes (M2-07)', () => {
  it('replaces notes on the selected items only', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG, FIVE);
    await user.click(screen.getByRole('button', { name: 'Change notes…' }));
    await user.type(within(dialog()).getByLabelText('Note for the selected items'), 'ask first');
    await user.click(within(dialog()).getByRole('button', { name: 'Replace notes' }));
    const profile = await stored();
    expect(getAnswer(profile, 'starter_hug').note).toBe('ask first');
    expect(getAnswer(profile, 'starter_high_five').note).toBe('ask first');
    expect(getAnswer(profile, 'starter_shoulder')).toBeNull();
  });

  it('an empty box removes notes, and the button says so', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG);
    await user.click(screen.getByRole('button', { name: 'Change notes…' }));
    await user.type(within(dialog()).getByLabelText('Note for the selected items'), 'temp');
    await user.click(within(dialog()).getByRole('button', { name: 'Replace notes' }));
    await user.click(screen.getByRole('button', { name: 'Change notes…' }));
    expect(within(dialog()).getByRole('button', { name: 'Remove notes' })).toBeTruthy();
    expect(within(dialog()).getByText(/1 selected item has a note now/)).toBeTruthy();
    await user.click(within(dialog()).getByRole('button', { name: 'Remove notes' }));
    const profile = await stored();
    expect(getAnswer(profile, 'starter_hug')).toBeNull();
  });

  it('keeps focus inside the dialog', async () => {
    const { user } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG);
    await user.click(screen.getByRole('button', { name: 'Change notes…' }));
    // Focus starts on Cancel. Tab goes to the confirm button, then wraps to the first control.
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await user.tab();
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Remove notes' }));
    await user.tab();
    expect(document.activeElement).toBe(within(dialog()).getByLabelText('Note for the selected items'));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Remove notes' }));
  });
});

describe('accessibility (M2-07)', () => {
  it('has no serious violations with selecting on, and with a dialog open', async () => {
    const { user, container } = await renderAtlas(db);
    await startSelecting(user);
    await pick(user, HUG);
    expect(await seriousViolations(container)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Change notes…' }));
    expect(await seriousViolations(container)).toEqual([]);
  });
});
