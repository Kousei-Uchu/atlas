// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';
import { loadProfile, listProfiles } from '../../src/storage/profile-repository.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';
const liveText = () => document.querySelector('[role="status"][aria-live="polite"]').textContent.trim();
const stateText = () => stateButton(HUG).textContent;

async function stored() {
  await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  const [summary] = await listProfiles(db);
  return (await loadProfile(db, summary.id)).profile;
}

async function openSettings(user) {
  await user.click(screen.getByRole('button', { name: 'Edit click behaviour' }));
}

const radio = (name) => screen.getByRole('radio', { name });

describe('click behaviour panel (M2-09)', () => {
  it('is closed at first and opens and closes from one button', async () => {
    const { user } = await renderAtlas(db);
    expect(screen.queryByRole('radio')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Edit click behaviour' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide click behaviour' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Hide click behaviour' }));
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('shows the defaults: primary toward No, stop at the end', async () => {
    const { user } = await renderAtlas(db);
    await openSettings(user);
    expect(radio('Toward No').checked).toBe(true);
    expect(radio('Toward Yes').checked).toBe(false);
    expect(radio('Stop at the end').checked).toBe(true);
    expect(radio('Go around to the other end').checked).toBe(false);
  });

  it('names the ends from the states, so a renamed end shows up here', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: 'Edit palette' }));
    await user.click(screen.getByRole('button', { name: 'Edit Yes' }));
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Happy to');
    await user.click(screen.getByRole('button', { name: 'Save changes to Yes' }));
    await openSettings(user);
    expect(radio('Toward Happy to')).toBeTruthy();
  });
});

describe('which way a primary click moves (M2-09)', () => {
  it('flips the direction of primary and secondary clicks and announces it', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG));
    expect(stateText()).toBe('Unsure'); // default: primary goes toward No
    await user.click(stateButton(HUG)); // back toward the middle for the test
    fireEvent.contextMenu(stateButton(HUG));
    expect(stateText()).toBe('Unsure');

    await openSettings(user);
    await user.click(radio('Toward Yes'));
    expect(liveText()).toBe('A primary click now moves toward Yes');

    await user.click(stateButton(HUG));
    expect(stateText()).toBe('Unanswered');
    await user.click(stateButton(HUG));
    expect(stateText()).toBe('Conditional');
    fireEvent.contextMenu(stateButton(HUG));
    expect(stateText()).toBe('Unanswered');
  });

  it('does not change any saved answer by itself', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG));
    await openSettings(user);
    await user.click(radio('Toward Yes'));
    expect(stateText()).toBe('Unsure');
    const profile = await stored();
    expect(profile.settings.interaction.primaryDirection).toBe('positive');
    expect(profile.answers.map((a) => a.stateId)).toEqual(['unsure']);
  });

  it('describes the secondary click for whichever end is chosen', async () => {
    const { user } = await renderAtlas(db);
    await openSettings(user);
    expect(screen.getByText(/always step the other way, toward Yes\./)).toBeTruthy();
    await user.click(radio('Toward Yes'));
    expect(screen.getByText(/always step the other way, toward No\./)).toBeTruthy();
  });
});

describe('what happens at the end (M2-09)', () => {
  async function toTheEnd(user) {
    for (let i = 0; i < 2; i += 1) await user.click(stateButton(HUG)); // Unsure, No
  }

  it('stops at the end by default and says so', async () => {
    const { user } = await renderAtlas(db);
    await toTheEnd(user);
    await user.click(stateButton(HUG));
    expect(stateText()).toBe('No');
    expect(liveText()).toMatch(/already at the end, still No/);
  });

  it('goes around when asked, and announces the setting', async () => {
    const { user } = await renderAtlas(db);
    await openSettings(user);
    await user.click(radio('Go around to the other end'));
    expect(liveText()).toBe('Clicks now go around at the end of the cycle');
    await toTheEnd(user);
    await user.click(stateButton(HUG));
    expect(stateText()).toBe('Yes');
  });

  it('goes back to stopping when switched back', async () => {
    const { user } = await renderAtlas(db);
    await openSettings(user);
    await user.click(radio('Go around to the other end'));
    await user.click(radio('Stop at the end'));
    expect(liveText()).toBe('Clicks now stop at the end of the cycle');
    await toTheEnd(user);
    await user.click(stateButton(HUG));
    expect(stateText()).toBe('No');
  });
});

describe('saving and undo (M2-09)', () => {
  it('saves both settings in the profile and restores them after a reload', async () => {
    const first = await renderAtlas(db);
    await openSettings(first.user);
    await first.user.click(radio('Toward Yes'));
    await first.user.click(radio('Go around to the other end'));
    const profile = await stored();
    expect(profile.settings.interaction.primaryDirection).toBe('positive');
    expect(profile.settings.cycle.endBehaviour).toBe('loop');

    first.unmount();
    const second = await renderAtlas(db);
    await openSettings(second.user);
    expect(radio('Toward Yes').checked).toBe(true);
    expect(radio('Go around to the other end').checked).toBe(true);
  });

  it('can be undone and redone, and the buttons follow', async () => {
    const { user } = await renderAtlas(db);
    await openSettings(user);
    await user.click(radio('Toward Yes'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(radio('Toward No').checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(radio('Toward Yes').checked).toBe(true);
  });

  it('choosing the option already selected does nothing and adds no undo step', async () => {
    const { user } = await renderAtlas(db);
    await openSettings(user);
    await user.click(radio('Toward No'));
    expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(true);
  });

  it('is kept in a copy of the profile', async () => {
    const { user } = await renderAtlas(db);
    await openSettings(user);
    await user.click(radio('Go around to the other end'));
    await user.click(screen.getByRole('button', { name: 'Make a copy of this profile' }));
    await waitFor(() => expect(document.querySelector('.profile-name').textContent).toBe('Profile: Copy of My profile'));
    // The panel may stay open across the switch; open it only if it is closed.
    if (screen.queryByRole('button', { name: 'Edit click behaviour' })) await openSettings(user);
    expect(radio('Go around to the other end').checked).toBe(true);
  });
});

describe('keyboard and accessibility (M2-09)', () => {
  it('can be changed with the keyboard alone', async () => {
    const { user } = await renderAtlas(db);
    const toggle = screen.getByRole('button', { name: 'Edit click behaviour' });
    toggle.focus();
    await user.keyboard('{Enter}');
    // Arrow-key movement inside a radio group is the browser's own; the e2e spec covers it.
    // Here: each radio takes focus and Space chooses it.
    radio('Toward Yes').focus();
    expect(document.activeElement).toBe(radio('Toward Yes'));
    await user.keyboard(' ');
    expect(radio('Toward Yes').checked).toBe(true);
  });

  it('gives each choice a name and a description, in two labelled groups', async () => {
    const { user } = await renderAtlas(db);
    await openSettings(user);
    expect(screen.getByRole('group', { name: 'Which way a primary click moves' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'At the end of the click cycle' })).toBeTruthy();
    expect(radio('Stop at the end').getAttribute('aria-describedby')).toBeTruthy();
  });

  it('has no serious or critical axe violations while open', async () => {
    const { user, container } = await renderAtlas(db);
    await openSettings(user);
    expect(await seriousViolations(container)).toEqual([]);
  });
});
