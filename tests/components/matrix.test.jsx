// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';
import { loadProfile, listProfiles } from '../../src/storage/profile-repository.js';
import { effectiveStateId } from '../../src/domain/selectors.js';
import { CONSENT_NOTICE, LOCAL_STORAGE_NOTICE, NO_UPLOAD_NOTICE } from '../../src/content/notices.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';

/** Wait for autosave to land, then read the stored profile. */
async function stored() {
  await waitFor(async () => expect(screen.getByText('Saved')).toBeTruthy());
  const [summary] = await listProfiles(db);
  return (await loadProfile(db, summary.id)).profile;
}

describe('chart display', () => {
  it('starts every sample item as Unanswered, never a yes (I-01)', async () => {
    await renderAtlas(db);
    const buttons = screen.getAllByRole('button', { name: /: Unanswered$/ });
    expect(buttons).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /: Yes$/ })).toBeNull();
  });

  it('gives every state button an accessible name with the item and state text (M1-AC-05)', async () => {
    await renderAtlas(db);
    expect(screen.getByRole('button', { name: `${HUG}: Unanswered` })).toBeTruthy();
  });

  it('shows state by text and icon as well as colour (I-09)', async () => {
    await renderAtlas(db);
    const badge = stateButton(HUG).querySelector('.state-badge');
    expect(badge.textContent).toBe('Unanswered');
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(badge.getAttribute('data-pattern')).toBe('dashed');
  });

  it('has no serious or critical accessibility violations (M1-AC-05)', async () => {
    const { container } = await renderAtlas(db);
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('shows the consent, local-storage and no-upload notices (M1-AC-11, I-02)', async () => {
    await renderAtlas(db);
    for (const text of [CONSENT_NOTICE, LOCAL_STORAGE_NOTICE, NO_UPLOAD_NOTICE]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});

describe('moving along the cycle (M1-AC-04)', () => {
  it('primary click moves toward No, secondary toward Yes (default setting)', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG));
    expect(stateButton(HUG).textContent).toBe('Unsure');
    await user.click(stateButton(HUG));
    expect(stateButton(HUG).textContent).toBe('No');
    fireEvent.contextMenu(stateButton(HUG));
    expect(stateButton(HUG).textContent).toBe('Unsure');
    fireEvent.contextMenu(stateButton(HUG));
    fireEvent.contextMenu(stateButton(HUG));
    expect(stateButton(HUG).textContent).toBe('Conditional');
  });

  it('suppresses the context menu on state cells only', async () => {
    await renderAtlas(db);
    expect(fireEvent.contextMenu(stateButton(HUG))).toBe(false); // false means preventDefault was called
    expect(fireEvent.contextMenu(screen.getByRole('heading', { level: 1 }))).toBe(true);
    expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'Undo' }))).toBe(true);
  });

  it('Enter and Space are primary; Shift+Enter and Shift+Space are secondary', async () => {
    const { user } = await renderAtlas(db);
    stateButton(HUG).focus();
    await user.keyboard('{Enter}');
    expect(stateButton(HUG).textContent).toBe('Unsure');
    await user.keyboard(' ');
    expect(stateButton(HUG).textContent).toBe('No');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(stateButton(HUG).textContent).toBe('Unsure');
    await user.keyboard('{Shift>} {/Shift}');
    expect(stateButton(HUG).textContent).toBe('Unanswered');
  });

  it('clamps at the ends and announces it', async () => {
    const { user } = await renderAtlas(db);
    for (let i = 0; i < 3; i += 1) await user.click(stateButton(HUG)); // Unsure, No, already at the end
    expect(stateButton(HUG).textContent).toBe('No');
    expect(document.querySelector('[aria-live="polite"]').textContent).toMatch(/already at the end, still No/);
  });

  it('reaches every state through the picker, with no right click needed', async () => {
    const { user } = await renderAtlas(db);
    const picker = screen.getAllByRole('combobox', { name: `Choose a state for ${HUG}` })[0];
    const labels = within(picker).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['No', 'Unsure', 'Unanswered', 'Conditional', 'Yes', 'Not applicable']);
    for (const label of labels) {
      await user.selectOptions(picker, label);
      expect(stateButton(HUG).textContent).toBe(label);
    }
  });

  it('leaves Not applicable by click and lands on Unanswered (D-007)', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(screen.getAllByRole('combobox', { name: `Choose a state for ${HUG}` })[0], 'Not applicable');
    await user.click(stateButton(HUG));
    expect(stateButton(HUG).textContent).toBe('Unanswered');
  });

  it('stores Unanswered as no answer record (D-012)', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG)); // Unsure
    expect((await stored()).answers.map((a) => a.stateId)).toEqual(['unsure']);
    await user.selectOptions(screen.getAllByRole('combobox', { name: `Choose a state for ${HUG}` })[0], 'Unanswered');
    await waitFor(async () => expect((await stored()).answers).toEqual([]));
  });
});

describe('notes', () => {
  it('adds a private note, then lets the person mark it shareable (I-11)', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: `Note for ${HUG}` }));
    const share = screen.getByRole('checkbox');
    expect(share.disabled).toBe(true); // nothing to share yet
    await user.type(screen.getByRole('textbox', { name: `Note for ${HUG}` }), 'Ask first');
    expect(share.disabled).toBe(false);
    expect(share.checked).toBe(false); // private by default
    await user.click(share);
    const profile = await stored();
    expect(profile.answers).toEqual([{ itemId: 'starter_hug', note: 'Ask first', noteShareable: true }]);
    expect(effectiveStateId(profile, 'starter_hug')).toBe('unanswered'); // a note never implies a yes
  });

  it('undoes a whole typed note in one step (D-025)', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: `Note for ${HUG}` }));
    await user.type(screen.getByRole('textbox', { name: `Note for ${HUG}` }), 'Ask first');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('textbox', { name: `Note for ${HUG}` }).value).toBe('');
  });
});

describe('adding, renaming and deleting (M1-AC-07)', () => {
  it('adds a category and an item', async () => {
    const { user } = await renderAtlas(db);
    await user.type(screen.getByPlaceholderText('New category name'), 'Hobbies');
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    await user.type(screen.getByPlaceholderText('New item in Hobbies'), 'Board games');
    await user.click(screen.getAllByRole('button', { name: 'Add item' }).at(-1));
    expect(screen.getByRole('button', { name: 'Board games: Unanswered' })).toBeTruthy();
  });

  it('renames an item with Enter and cancels with Escape', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: `Rename item ${HUG}` }));
    await user.clear(screen.getByRole('textbox', { name: `New name for item ${HUG}` }));
    await user.type(screen.getByRole('textbox', { name: `New name for item ${HUG}` }), 'A warm hug{Enter}');
    expect(screen.getByRole('button', { name: 'A warm hug: Unanswered' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Rename item A warm hug' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: /New name/ })).toBeNull();
  });

  it('rejects an over-long name with a readable message instead of changing anything', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: `Rename item ${HUG}` }));
    const input = screen.getByRole('textbox', { name: `New name for item ${HUG}` });
    input.removeAttribute('maxlength');
    fireEvent.change(input, { target: { value: 'x'.repeat(201) } });
    await user.keyboard('{Enter}');
    expect((await screen.findByRole('alert')).textContent).toMatch(/200 characters or fewer/);
    expect(screen.getByRole('button', { name: `${HUG}: Unanswered` })).toBeTruthy();
  });

  it('asks before deleting a category, says what goes, and undo restores it with no dangling references', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG));
    await user.click(screen.getByRole('button', { name: 'Delete category Sample: Physical contact' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/4 items with their answers and notes/);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));

    await user.click(within(dialog).getByRole('button', { name: 'Delete category' }));
    expect(screen.queryByRole('button', { name: `${HUG}: Unsure` })).toBeNull();
    let profile = await stored();
    expect(profile.items).toHaveLength(3);
    expect(profile.answers).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stateButton(HUG).textContent).toBe('Unsure');
    profile = await stored();
    expect(profile.items).toHaveLength(7);
    expect(profile.answers.map((a) => a.itemId)).toEqual(['starter_hug']);
  });

  it('cancels a delete with Escape and changes nothing', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: 'Delete category Sample: Communication' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getAllByRole('button', { name: /: Unanswered$/ })).toHaveLength(7);
  });
});

describe('undo and redo', () => {
  it('covers state changes and works from the keyboard', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG));
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(stateButton(HUG).textContent).toBe('Unanswered');
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(stateButton(HUG).textContent).toBe('Unsure');
  });

  it('disables the buttons when there is nothing to undo or redo', async () => {
    await renderAtlas(db);
    expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Redo' }).disabled).toBe(true);
  });
});
