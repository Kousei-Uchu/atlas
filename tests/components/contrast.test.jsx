// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations } from './helpers.jsx';
import { loadProfile, listProfiles } from '../../src/storage/profile-repository.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

async function stored() {
  await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  const [summary] = await listProfiles(db);
  return (await loadProfile(db, summary.id)).profile;
}

async function openEditor(user, stateLabel) {
  await user.click(screen.getByRole('button', { name: 'Edit palette' }));
  await user.click(screen.getByRole('button', { name: `Edit ${stateLabel}` }));
  return screen.getByRole('form', { name: `Edit ${stateLabel}` });
}

const hexField = (form, label) => within(form).getByRole('textbox', { name: `${label}, as a hex code` });
const note = (form) => form.querySelector('.contrast-note');

describe('contrast note in the state editor (M2-03)', () => {
  it('says a built-in state is easy to read, with its ratio', async () => {
    const { user } = await renderAtlas(db);
    const form = await openEditor(user, 'Yes');
    expect(note(form).textContent).toMatch(/^Contrast \d+\.\d to 1\. Easy to read\.$/);
    expect(note(form).getAttribute('data-level')).toMatch(/ok|good/);
  });

  it('warns in words as soon as the colours get too close, and updates as they change', async () => {
    const { user } = await renderAtlas(db);
    const form = await openEditor(user, 'Yes');
    const background = hexField(form, 'Background colour').value;

    fireEvent.change(hexField(form, 'Text and border colour'), { target: { value: background } });
    expect(note(form).textContent).toMatch(/^Low contrast: 1\.0 to 1\./);
    expect(note(form).getAttribute('data-level')).toBe('poor');

    fireEvent.change(hexField(form, 'Text and border colour'), { target: { value: '#000000' } });
    fireEvent.change(hexField(form, 'Background colour'), { target: { value: '#ffffff' } });
    expect(note(form).textContent).toMatch(/Easy to read/);
  });

  it('waits quietly while a hex code is still being typed', async () => {
    const { user } = await renderAtlas(db);
    const form = await openEditor(user, 'Yes');
    fireEvent.change(hexField(form, 'Text and border colour'), { target: { value: '#12' } });
    expect(note(form).getAttribute('data-level')).toBe('pending');
    expect(note(form).textContent).toMatch(/once both colours are complete/);
  });

  it('is only advice: Save stays available and the colours are stored as typed (I-03)', async () => {
    const { user } = await renderAtlas(db);
    const form = await openEditor(user, 'Yes');
    const background = hexField(form, 'Background colour').value;
    fireEvent.change(hexField(form, 'Text and border colour'), { target: { value: background } });

    const save = screen.getByRole('button', { name: 'Save changes to Yes' });
    expect(save.disabled).toBe(false);
    await user.click(save);

    const profile = await stored();
    const yes = profile.states.find((s) => s.id === 'yes');
    expect(yes.textColor.toLowerCase()).toBe(background.toLowerCase());
    expect(yes.label).toBe('Yes');
  });

  it('is linked to both colour fields, so a screen reader reads it on focus', async () => {
    const { user } = await renderAtlas(db);
    const form = await openEditor(user, 'Yes');
    const id = note(form).id;
    expect(id).toBeTruthy();
    for (const label of ['Background colour', 'Text and border colour']) {
      expect(hexField(form, label).getAttribute('aria-describedby')).toBe(id);
      expect(within(form).getByLabelText(label, { selector: 'input[type="color"]' }).getAttribute('aria-describedby')).toBe(id);
    }
  });

  it('is not a live region, so typing does not flood a screen reader', async () => {
    const { user } = await renderAtlas(db);
    const form = await openEditor(user, 'Yes');
    expect(note(form).hasAttribute('aria-live')).toBe(false);
    expect(note(form).closest('[aria-live]')).toBeNull();
    expect(note(form).getAttribute('role')).toBeNull();
  });

  it('has no serious or critical accessibility violations while a warning shows', async () => {
    const { user, container } = await renderAtlas(db);
    const form = await openEditor(user, 'Yes');
    fireEvent.change(hexField(form, 'Text and border colour'), { target: { value: hexField(form, 'Background colour').value } });
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe('contrast flag in the palette list (M2-03)', () => {
  it('shows no flag for the built-in palette', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: 'Edit palette' }));
    expect(document.querySelector('.contrast-flag')).toBeNull();
  });

  it('flags a saved weak state in its row, and undo removes the flag', async () => {
    const { user } = await renderAtlas(db);
    const form = await openEditor(user, 'Yes');
    fireEvent.change(hexField(form, 'Text and border colour'), { target: { value: hexField(form, 'Background colour').value } });
    await user.click(screen.getByRole('button', { name: 'Save changes to Yes' }));

    const row = document.querySelector('[data-state-id="yes"]');
    const flag = row.querySelector('.contrast-flag');
    expect(flag.textContent).toBe('Low contrast (1.0 to 1)');
    expect(document.querySelectorAll('.contrast-flag')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(document.querySelector('.contrast-flag')).toBeNull();
  });
});
