// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seriousViolations } from './helpers.jsx';
import { ViewsPanel } from '../../src/features/views/ViewsPanel.jsx';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addCategory, addItem, setItemNote, setNoteShareable, setItemState } from '../../src/domain/commands.js';
import { addAudience } from '../../src/domain/audience-commands.js';
import { addView } from '../../src/domain/view-commands.js';
import { CONSENT_NOTICE } from '../../src/content/notices.js';

const NOW = '2026-10-31T10:00:00.000Z';
const must = (r) => { expect(r.ok, r.error).toBe(true); return r.profile; };
const SECRET = 'ZZ-restricted-label';
const SECRET_NOTE = 'ZZ-note';

function fixture(extra = (p) => p) {
  let p = createStarterProfile({ id: 'p1', title: 'ZZ-profile-title', now: NOW });
  p = { ...p, categories: [], items: [], answers: [] };
  for (const level of ['normal', 'sensitive', 'restricted']) p = must(addCategory(p, { id: `cat_${level}`, name: `Cat ${level}`, sensitivity: level }, NOW));
  p = must(addItem(p, { id: 'item_open', categoryId: 'cat_normal', label: 'Open thing' }, NOW));
  p = must(addItem(p, { id: 'item_sens', categoryId: 'cat_sensitive', label: 'Sensitive thing' }, NOW));
  p = must(addItem(p, { id: 'item_restr', categoryId: 'cat_restricted', label: SECRET }, NOW));
  for (const id of ['item_open', 'item_sens', 'item_restr']) p = must(setItemState(p, { itemId: id, stateId: 'yes' }, NOW));
  p = must(setItemNote(p, { itemId: 'item_open', note: SECRET_NOTE }, NOW));
  p = must(setNoteShareable(p, { itemId: 'item_open', shareable: true }, NOW));
  p = must(addAudience(p, { id: 'aud_1', name: 'Friends', type: 'friends' }, NOW));
  return extra(p);
}

let latest = null;
function Harness({ initial, tools }) {
  const [profile, setProfile] = useState(initial);
  const [said, setSaid] = useState('');
  latest = profile;
  const run = (command, args) => {
    const result = command(profile, args, NOW);
    if (result.ok) setProfile(result.profile);
    return result;
  };
  return (
    <>
      <ViewsPanel profile={profile} run={run} announce={setSaid} now={() => NOW} {...tools} />
      <p data-testid="said">{said}</p>
    </>
  );
}
const setup = (build, overrides = {}) => {
  const tools = { saveFile: vi.fn(), saveBlob: vi.fn(), makePng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })), ...overrides };
  const user = userEvent.setup();
  render(<Harness initial={fixture(build)} tools={tools} />);
  return { user, tools };
};
const open = (user) => user.click(screen.getByRole('button', { name: 'Open views' }));
const make = async (user, name = 'For friends', audience = 'Friends') => {
  await open(user);
  await user.type(screen.getByLabelText('Name of the view'), name);
  await user.selectOptions(screen.getByLabelText('Who it is for'), audience);
  await user.click(screen.getByRole('button', { name: 'Make view' }));
};
const pick = (user, label) => user.click(screen.getByRole('checkbox', { name: new RegExp(`^${label}`) }));
const counts = () => screen.getByTestId('review-counts').textContent;
const review = () => within(screen.getByTestId('review'));
const withView = (p) => must(addView(p, { id: 'view_1', name: 'Existing', audienceId: 'aud_1' }, NOW));

describe('views panel: making and picking (M4-05)', () => {
  it('is closed at first and says there are no views', async () => {
    const { user } = setup();
    expect(screen.getByRole('button', { name: 'Open views' }).getAttribute('aria-expanded')).toBe('false');
    await open(user);
    expect(screen.getByText('No views yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make view' }).disabled).toBe(true);
  });

  it('makes a view that includes nothing, opens it, and cannot export yet', async () => {
    const { user } = setup();
    await make(user);
    expect(latest.views).toMatchObject([{ name: 'For friends', audienceId: 'aud_1', includedItemIds: [], includeSensitive: false, includeNotes: false }]);
    expect(screen.getByTestId('said').textContent).toMatch(/includes nothing until you pick items/);
    expect(counts()).toBe('0 items included, 0 items held back.');
    for (const name of ['Download Markdown', 'Download SVG picture', 'Download PNG picture']) expect(screen.getByRole('button', { name }).disabled).toBe(true);
    expect(screen.getByText('Pick at least one item that can be included to export.')).toBeTruthy();
  });

  it('shows what each pick does in the review, with the answer', async () => {
    const { user } = setup(withView);
    await open(user);
    await user.click(screen.getByRole('button', { name: /^Build and export/ }));
    await pick(user, 'Open thing');
    expect(counts()).toBe('1 item included, 0 items held back.');
    expect(review().getByText('Open thing')).toBeTruthy();
    expect(review().getByText(/Yes/)).toBeTruthy();
    expect(latest.views[0].includedItemIds).toEqual(['item_open']);
    await pick(user, 'Open thing');
    expect(latest.views[0].includedItemIds).toEqual([]);
  });

  it('picks and clears a whole category', async () => {
    const { user } = setup(withView);
    await open(user);
    await user.click(screen.getByRole('button', { name: /^Build and export/ }));
    await user.click(screen.getByRole('button', { name: 'Pick all in Cat normal' }));
    expect(latest.views[0].includedItemIds).toEqual(['item_open']);
    await user.click(screen.getByRole('button', { name: 'Clear Cat normal' }));
    expect(latest.views[0].includedItemIds).toEqual([]);
  });

  it('marks sensitive and restricted items in the picker, so the level is known before picking', async () => {
    const { user } = setup(withView);
    await open(user);
    await user.click(screen.getByRole('button', { name: /^Build and export/ }));
    expect(screen.getByRole('checkbox', { name: /^Sensitive thing \(sensitive\)/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: new RegExp(`^${SECRET} \\(restricted\\)`) })).toBeTruthy();
  });
});

describe('the review holds back what the rules say, and says why (I-11)', () => {
  const opened = async (build) => {
    const s = setup((p) => (build ? build(withView(p)) : withView(p)));
    await open(s.user);
    await s.user.click(screen.getByRole('button', { name: /^Build and export/ }));
    return s;
  };

  it('holds a sensitive item back until the view allows sensitive items', async () => {
    const { user } = await opened();
    await pick(user, 'Sensitive thing');
    expect(counts()).toBe('0 items included, 1 item held back.');
    expect(review().getByText(/Held back: it is sensitive/)).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: /^Include sensitive items/ }));
    expect(counts()).toBe('1 item included, 0 items held back.');
  });

  it('holds a restricted item back until it is chosen on its own, and the sensitive switch does not open it', async () => {
    const { user } = await opened();
    await user.click(screen.getByRole('checkbox', { name: /^Include sensitive items/ }));
    await pick(user, SECRET);
    expect(counts()).toBe('0 items included, 1 item held back.');
    expect(review().getByText(/Held back: it is restricted/)).toBeTruthy();
    await user.click(review().getByRole('checkbox', { name: new RegExp(`^Include ${SECRET} in this view`) }));
    expect(latest.views[0].restrictedOptInItemIds).toEqual(['item_restr']);
    expect(counts()).toBe('1 item included, 0 items held back.');
    await user.click(review().getByRole('checkbox', { name: new RegExp(`^Include ${SECRET} in this view`) }));
    expect(counts()).toBe('0 items included, 1 item held back.');
  });

  it('includes a note only with both switches, and says so', async () => {
    const { user } = await opened();
    await pick(user, 'Open thing');
    expect(review().queryByText(/with its note/)).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /^Include notes/ }));
    expect(review().getByText(/with its note/)).toBeTruthy();
    expect(counts()).toBe('1 item included, 0 items held back, 1 note included.');
  });

  it('holds back an item in a hidden category and labels the category', async () => {
    const { user } = await opened((p) => ({ ...p, categories: p.categories.map((c) => (c.id === 'cat_normal' ? { ...c, visibility: 'hidden' } : c)) }));
    expect(screen.getByText(/hidden category: its items are held back/)).toBeTruthy();
    await pick(user, 'Open thing');
    expect(review().getByText(/Held back: its category is hidden/)).toBeTruthy();
  });

  it('stops exports and says why while overrides disagree', async () => {
    const { user } = await opened((p) => ({
      ...p,
      views: p.views.map((v) => ({ ...v, includedItemIds: ['item_open'] })),
      overrides: [
        { id: 'ov_a', itemId: 'item_open', audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: '' },
        { id: 'ov_b', itemId: 'item_open', audienceId: 'aud_1', stateId: 'no', enabled: true, explanation: '' },
      ],
    }));
    expect(screen.getByRole('alert').textContent).toMatch(/overrides that disagree/);
    expect(screen.getByRole('button', { name: 'Download Markdown' }).disabled).toBe(true);
    expect(screen.getByText('Settle the problem above to export.')).toBeTruthy();
    expect(user).toBeTruthy();
  });
});

describe('exporting (M4-06)', () => {
  const ready = async (extra = {}) => {
    const s = setup((p) => withView({ ...p, views: [] }), extra);
    await open(s.user);
    await s.user.click(screen.getByRole('button', { name: /^Build and export/ }));
    await pick(s.user, 'Open thing');
    await pick(s.user, 'Sensitive thing');
    await pick(s.user, SECRET);
    return s;
  };

  it('downloads Markdown with the statement, and nothing that was held back', async () => {
    const { user, tools } = await ready();
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    expect(tools.saveFile).toHaveBeenCalledTimes(1);
    const [filename, text, type] = tools.saveFile.mock.calls[0];
    expect(filename).toBe('atlas-existing-2026-10-31.md');
    expect(type).toBe('text/markdown');
    expect(text).toContain(CONSENT_NOTICE);
    expect(text).toContain('Open thing');
    for (const secret of [SECRET, SECRET_NOTE, 'Sensitive thing', 'ZZ-profile-title']) expect(text, secret).not.toContain(secret);
    expect(screen.getByTestId('said').textContent).toBe('Downloaded Existing as Markdown');
  });

  it('downloads an SVG picture with the statement and the same items', async () => {
    const { user, tools } = await ready();
    await user.click(screen.getByRole('button', { name: 'Download SVG picture' }));
    const [filename, svg, type] = tools.saveFile.mock.calls[0];
    expect(filename).toBe('atlas-existing-2026-10-31.svg');
    expect(type).toBe('image/svg+xml');
    expect(svg).toContain('A chart shows general preferences.');
    expect(svg).toContain('Open thing');
    expect(svg).not.toContain(SECRET);
  });

  it('downloads a PNG made from that same SVG, at its own size', async () => {
    const { user, tools } = await ready();
    await user.click(screen.getByRole('button', { name: 'Download PNG picture' }));
    await waitFor(() => expect(tools.saveBlob).toHaveBeenCalledTimes(1));
    const [svg, size] = tools.makePng.mock.calls[0];
    expect(svg.startsWith('<svg')).toBe(true);
    expect(size.width).toBe(840);
    expect(tools.saveBlob.mock.calls[0][0]).toBe('atlas-existing-2026-10-31.png');
    expect(tools.saveBlob.mock.calls[0][1]).toBeInstanceOf(Blob);
  });

  it('says so, and saves nothing, when the picture cannot be made', async () => {
    const { user, tools } = await ready({ makePng: vi.fn(async () => { throw new Error('no canvas'); }) });
    await user.click(screen.getByRole('button', { name: 'Download PNG picture' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/could not be made in this browser/);
    expect(tools.saveBlob).not.toHaveBeenCalled();
  });

  it('shows a Markdown preview of exactly what would be saved', async () => {
    const { user, tools } = await ready();
    await user.click(screen.getByRole('button', { name: 'Show Markdown preview' }));
    const shown = screen.getByLabelText('Markdown preview').value;
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    expect(shown).toBe(tools.saveFile.mock.calls[0][1]);
    await user.click(screen.getByRole('button', { name: 'Hide Markdown preview' }));
    expect(screen.queryByLabelText('Markdown preview')).toBeNull();
  });

  it('states what every export carries, next to the buttons', async () => {
    await ready();
    expect(screen.getByText(new RegExp(`Every export carries this statement and a key to its states: ${CONSENT_NOTICE.slice(0, 30)}`))).toBeTruthy();
  });
});

describe('managing views', () => {
  it('renames, changes the audience, and deletes only the view after asking', async () => {
    const { user } = setup(withView);
    await open(user);
    await user.click(screen.getByRole('button', { name: /^Build and export/ }));
    await user.click(screen.getByRole('button', { name: /^Rename/ }));
    const field = screen.getByRole('textbox', { name: /^New name for/ });
    await user.clear(field);
    await user.type(field, 'Renamed{Enter}');
    expect(latest.views[0].name).toBe('Renamed');
    await user.selectOptions(screen.getByLabelText('Who this view is for'), 'Everyone (my own answers)');
    expect(latest.views[0].audienceId).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Delete Renamed/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the view Renamed?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(latest.views).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /^Delete Renamed/ }));
    await user.click(screen.getByRole('button', { name: 'Delete view' }));
    expect(latest.views).toEqual([]);
    expect(latest.items).toHaveLength(3);
    expect(latest.audiences).toHaveLength(1);
  });

  it('has no serious accessibility problems with a view open, a review and a preview showing', async () => {
    const { user } = setup((p) => withView({ ...p, views: [] }));
    await open(user);
    await user.type(screen.getByLabelText('Name of the view'), 'A11y');
    await user.click(screen.getByRole('button', { name: 'Make view' }));
    await pick(user, 'Open thing');
    await pick(user, SECRET);
    await user.click(screen.getByRole('button', { name: 'Show Markdown preview' }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
