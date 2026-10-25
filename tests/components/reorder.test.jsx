// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';
import { loadProfile, listProfiles } from '../../src/storage/profile-repository.js';
import { sortedByOrder } from '../../src/domain/selectors.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';
const FIVE = 'A high five';
const SHOULDER = 'A hand on my shoulder';
const SIT = 'Sitting close beside me';

const labels = () => [...document.querySelectorAll('.item-row .item-label')].map((n) => n.textContent);
const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).filter((t) => t.startsWith('Sample'));
const up = (name) => screen.getByRole('button', { name: `Move item ${name} up` });
const down = (name) => screen.getByRole('button', { name: `Move item ${name} down` });
const catUp = (name) => screen.getByRole('button', { name: `Move category ${name} up` });
const catDown = (name) => screen.getByRole('button', { name: `Move category ${name} down` });
const live = () => document.querySelector('[role="status"][aria-live="polite"]').textContent;

async function stored() {
  await waitFor(async () => expect(screen.getByText('Saved')).toBeTruthy());
  const [summary] = await listProfiles(db);
  return (await loadProfile(db, summary.id)).profile;
}

describe('reordering items (M2-06)', () => {
  it('moves an item down and up with buttons that name the item', async () => {
    const { user } = await renderAtlas(db);
    await user.click(down(HUG));
    expect(labels().slice(0, 4)).toEqual([FIVE, HUG, SHOULDER, SIT]);
    await user.click(up(HUG));
    expect(labels().slice(0, 4)).toEqual([HUG, FIVE, SHOULDER, SIT]);
  });

  it('disables Up on the first item and Down on the last of each category', async () => {
    await renderAtlas(db);
    expect(up(HUG).disabled).toBe(true);
    expect(down(HUG).disabled).toBe(false);
    expect(down(SIT).disabled).toBe(true);
    expect(up('Being contacted by text').disabled).toBe(true);
    expect(down('Getting notice before a change of plans').disabled).toBe(true);
  });

  it('announces the new position', async () => {
    const { user } = await renderAtlas(db);
    await user.click(down(HUG));
    await waitFor(() => expect(live()).toContain(`${HUG} moved down: position 2 of 4`));
  });

  it('keeps keyboard focus on the button that was used', async () => {
    const { user } = await renderAtlas(db);
    await user.click(down(HUG));
    expect(document.activeElement).toBe(down(HUG));
  });

  it('moves focus to the opposite button when a move reaches the end', async () => {
    const { user } = await renderAtlas(db);
    await user.click(down(SHOULDER));
    expect(down(SHOULDER).disabled).toBe(true);
    expect(document.activeElement).toBe(up(SHOULDER));
  });

  it('works from the keyboard', async () => {
    const { user } = await renderAtlas(db);
    down(HUG).focus();
    await user.keyboard('{Enter}');
    expect(labels().slice(0, 2)).toEqual([FIVE, HUG]);
  });

  it('saves the order, and a reload shows it', async () => {
    const { user } = await renderAtlas(db);
    await user.click(down(HUG));
    const profile = await stored();
    const order = sortedByOrder(profile.items.filter((i) => i.categoryId === 'starter_contact')).map((i) => i.label);
    expect(order).toEqual([FIVE, HUG, SHOULDER, SIT]);
  });

  it('can be undone and redone', async () => {
    const { user } = await renderAtlas(db);
    await user.click(down(HUG));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(labels().slice(0, 2)).toEqual([HUG, FIVE]);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(labels().slice(0, 2)).toEqual([FIVE, HUG]);
  });

  it('does not change anyone’s answer (I-03)', async () => {
    const { user } = await renderAtlas(db);
    await user.click(stateButton(HUG));
    await user.click(down(HUG));
    expect(stateButton(HUG).textContent).toBe('Unsure');
    const profile = await stored();
    expect(profile.answers).toHaveLength(1);
  });
});

describe('reordering categories (M2-06)', () => {
  it('moves a category and its items together', async () => {
    const { user } = await renderAtlas(db);
    expect(headings()).toEqual(['Sample: Physical contact', 'Sample: Communication']);
    await user.click(catDown('Sample: Physical contact'));
    expect(headings()).toEqual(['Sample: Communication', 'Sample: Physical contact']);
    expect(labels()[0]).toBe('Being contacted by text');
    expect(labels()[3]).toBe(HUG);
  });

  it('disables Up on the first category and Down on the last', async () => {
    await renderAtlas(db);
    expect(catUp('Sample: Physical contact').disabled).toBe(true);
    expect(catDown('Sample: Communication').disabled).toBe(true);
  });

  it('keeps focus on the moved category’s button', async () => {
    const { user } = await renderAtlas(db);
    await user.click(catDown('Sample: Physical contact'));
    expect(document.activeElement).toBe(catUp('Sample: Physical contact'));
  });

  it('can be undone', async () => {
    const { user } = await renderAtlas(db);
    await user.click(catDown('Sample: Physical contact'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(headings()).toEqual(['Sample: Physical contact', 'Sample: Communication']);
  });
});

describe('reordering while filtering (M2-06)', () => {
  it('offers no move buttons while a search is on, and brings them back after', async () => {
    const { user } = await renderAtlas(db);
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'hug');
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('button', { name: /^Move item / }).length).toBeGreaterThan(0);
  });

  it('has no serious accessibility violations with the move buttons showing', async () => {
    const { container } = await renderAtlas(db);
    expect(await seriousViolations(container)).toEqual([]);
  });
});
