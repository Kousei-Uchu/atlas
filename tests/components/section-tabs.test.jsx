// @vitest-environment jsdom
// The section tabs (UX pass, D-076): one section shows at a time, the keyboard works, and what a person
// was doing in a section is still there when they come back.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { freshDb, renderAtlas, stateButton } from './helpers.jsx';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const tabs = () => within(screen.getByRole('tablist', { name: 'Sections' })).getAllByRole('tab');

describe('section tabs', () => {
  it('offers the five sections, with the chart selected first', async () => {
    await renderAtlas(db, { keepSectionsHidden: true });
    expect(tabs().map((t) => t.textContent)).toEqual(['Chart', 'Modules', 'Explore', 'Share', 'Settings']);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it('shows only the selected section, and each tab controls a labelled panel', async () => {
    const { user } = await renderAtlas(db, { keepSectionsHidden: true });
    expect(screen.queryByRole('button', { name: 'Open timeline' })).toBeNull();
    expect(stateButton('A hug from a friend')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Explore' }));
    expect(screen.getByRole('button', { name: 'Open timeline' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^A hug from a friend:/ })).toBeNull();
    const panel = screen.getByRole('tabpanel', { name: 'Explore' });
    expect(panel.id).toBe(screen.getByRole('tab', { name: 'Explore' }).getAttribute('aria-controls'));
  });

  it('moves with the arrow keys, Home and End, and the tab stop follows the selection', async () => {
    const { user } = await renderAtlas(db, { keepSectionsHidden: true });
    screen.getByRole('tab', { name: 'Chart' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Modules' }));
    expect(screen.getByRole('tab', { name: 'Modules' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Settings' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Chart' }));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Settings' }));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Chart' }));
    expect(screen.getByRole('tab', { name: 'Chart' }).tabIndex).toBe(0);
  });

  it('keeps a section as it was left: an open panel stays open after visiting another section', async () => {
    const { user } = await renderAtlas(db, { keepSectionsHidden: true });
    await user.click(screen.getByRole('tab', { name: 'Explore' }));
    await user.click(screen.getByRole('button', { name: 'Open timeline' }));
    expect(screen.getByRole('button', { name: /^(Close|Hide) timeline/ })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Chart' }));
    await user.click(screen.getByRole('tab', { name: 'Explore' }));
    expect(screen.getByRole('button', { name: /^(Close|Hide) timeline/ })).toBeTruthy();
  });

  it('keeps the consent notice on the chart section', async () => {
    await renderAtlas(db, { keepSectionsHidden: true });
    expect(screen.getByText('Preferences are not consent')).toBeTruthy();
  });
});
