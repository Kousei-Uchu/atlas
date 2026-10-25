// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const HUG = 'A hug from a friend';
const CONTACT = 'Sample: Physical contact';

const search = () => screen.getByRole('searchbox', { name: 'Search items' });
const categorySelect = () => screen.getByRole('combobox', { name: 'Show category' });
const summary = () => document.querySelector('.search-summary').textContent;
const visibleItems = () => [...document.querySelectorAll('.item-row .item-label')].map((n) => n.textContent);
const clearButton = () => screen.getByRole('button', { name: 'Clear filters' });

describe('search (M2-05)', () => {
  it('shows every item and no filter message to begin with', async () => {
    await renderAtlas(db);
    expect(visibleItems()).toHaveLength(7);
    expect(summary()).toBe('7 items');
    expect(clearButton().disabled).toBe(true);
  });

  it('narrows the chart as the person types, and says how many match', async () => {
    const { user } = await renderAtlas(db);
    await user.type(search(), 'hug');
    expect(visibleItems()).toEqual([HUG]);
    expect(summary()).toContain('Showing 1 of 7 items');
    expect(clearButton().disabled).toBe(false);
  });

  it('ignores case and surrounding spaces', async () => {
    const { user } = await renderAtlas(db);
    await user.type(search(), '  HIGH five ');
    expect(visibleItems()).toEqual(['A high five']);
  });

  it('matches the category name, so a category word shows all of its items', async () => {
    const { user } = await renderAtlas(db);
    await user.type(search(), 'communication');
    expect(visibleItems()).toHaveLength(3);
  });

  it('hides categories with nothing to show', async () => {
    const { user } = await renderAtlas(db);
    await user.type(search(), 'phone');
    expect(screen.queryByRole('heading', { name: CONTACT })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Sample: Communication' })).toBeTruthy();
  });

  it('says so plainly when nothing matches, and Clear filters brings everything back', async () => {
    const { user } = await renderAtlas(db);
    await user.type(search(), 'zzz');
    expect(visibleItems()).toHaveLength(0);
    expect(screen.getByText(/No items match “zzz”/)).toBeTruthy();
    await user.click(within(document.querySelector('.empty')).getByRole('button', { name: 'Clear filters' }));
    expect(visibleItems()).toHaveLength(7);
    expect(search().value).toBe('');
  });

  it('does not search notes (D-030)', async () => {
    const { user } = await renderAtlas(db);
    await user.click(screen.getByRole('button', { name: /^Note for A high five/ }));
    await user.type(screen.getByLabelText('Note for A high five'), 'zebra');
    await user.type(search(), 'zebra');
    expect(visibleItems()).toHaveLength(0);
  });

  it('keeps answers editable while a filter is on', async () => {
    const { user } = await renderAtlas(db);
    await user.type(search(), 'hug');
    await user.click(stateButton(HUG));
    expect(stateButton(HUG).textContent).toBe('Unsure');
    await user.clear(search());
    expect(stateButton(HUG).textContent).toBe('Unsure');
  });

  it('hides the add-item forms while searching, but not the add-category form', async () => {
    const { user } = await renderAtlas(db);
    expect(screen.getAllByRole('button', { name: 'Add item' })).toHaveLength(2);
    await user.type(search(), 'hug');
    expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add category' })).toBeTruthy();
  });

  it('has no serious accessibility violations while filtering', async () => {
    const { user, container } = await renderAtlas(db);
    await user.type(search(), 'hug');
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe('category filter (M2-05)', () => {
  it('lists every visible category plus All categories', async () => {
    await renderAtlas(db);
    const names = within(categorySelect()).getAllByRole('option').map((o) => o.textContent);
    expect(names).toEqual(['All categories', CONTACT, 'Sample: Communication']);
  });

  it('shows one category only', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(categorySelect(), CONTACT);
    expect(visibleItems()).toHaveLength(4);
    expect(screen.queryByRole('heading', { name: 'Sample: Communication' })).toBeNull();
    expect(summary()).toContain('Showing 4 of 7 items');
  });

  it('combines with a search', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(categorySelect(), 'Sample: Communication');
    await user.type(search(), 'text');
    expect(visibleItems()).toEqual(['Being contacted by text']);
    await user.clear(search());
    await user.type(search(), 'hug');
    expect(visibleItems()).toHaveLength(0);
  });

  it('keeps the add-item form when only a category is chosen', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(categorySelect(), CONTACT);
    expect(screen.getAllByRole('button', { name: 'Add item' })).toHaveLength(1);
  });

  it('Clear filters resets both fields', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(categorySelect(), CONTACT);
    await user.type(search(), 'hug');
    await user.click(clearButton());
    expect(categorySelect().value).toBe('');
    expect(search().value).toBe('');
    expect(visibleItems()).toHaveLength(7);
  });

  it('falls back to every category if the filtered category is deleted', async () => {
    const { user } = await renderAtlas(db);
    await user.selectOptions(categorySelect(), 'Sample: Communication');
    await user.click(screen.getByRole('button', { name: /^Delete\s*category Sample: Communication/ }));
    await user.click(screen.getByRole('button', { name: 'Delete category' }));
    expect(visibleItems()).toHaveLength(4);
    expect(categorySelect().value).toBe('');
  });
});
