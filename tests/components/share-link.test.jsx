// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seriousViolations } from './helpers.jsx';
import { ShareLink } from '../../src/features/views/ShareLink.jsx';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addCategory, addItem, setItemState } from '../../src/domain/commands.js';
import { addView } from '../../src/domain/view-commands.js';
import { decodePayload } from '../../src/share/codec.js';
import { readFragment } from '../../src/share/fragment.js';
import { SHARE_PRIVACY_NOTICE, CONSENT_NOTICE } from '../../src/content/notices.js';

vi.setConfig({ testTimeout: 60000 });
const NOW = '2026-11-06T10:00:00.000Z';
const must = (r) => { if (!r.ok) throw new Error(r.error); return r.profile; };
const PAGE = 'https://example.test/atlas/';

/** Labels that do not compress, so a few items make a link of a chosen size. */
function noise(seed, length) {
  let a = seed;
  let out = '';
  for (let i = 0; i < length; i += 1) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    out += 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(a >>> 24) % 62];
  }
  return out;
}

function fixture(count = 2, labelLength = 0) {
  let p = createStarterProfile({ id: 'p1', title: 'ZZ-profile-title', now: NOW });
  p = { ...p, categories: [], items: [], answers: [] };
  p = must(addCategory(p, { id: 'c1', name: 'Contact', sensitivity: 'normal' }, NOW));
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const id = `item_${i}`;
    p = must(addItem(p, { id, categoryId: 'c1', label: labelLength > 0 ? noise(i + 1, labelLength) : `Thing ${i}` }, NOW));
    p = must(setItemState(p, { itemId: id, stateId: 'yes' }, NOW));
    ids.push(id);
  }
  p = must(addView(p, { id: 'v1', name: 'For friends' }, NOW));
  return { profile: p, view: { ...p.views[0], includedItemIds: ids } };
}

function Harness({ initial, tools }) {
  const [view, setView] = useState(initial.view);
  return (
    <>
      <button type="button" onClick={() => setView({ ...view, includedItemIds: view.includedItemIds.slice(1) })}>Change the view</button>
      <ShareLink profile={initial.profile} view={view} ready={view.includedItemIds.length > 0} now={() => NOW} announce={() => {}} pageUrl={PAGE} {...tools} />
    </>
  );
}
const setup = (count, labelLength, overrides = {}) => {
  const tools = { copyText: vi.fn(async () => {}), onDownloadFile: vi.fn(), ...overrides };
  const user = userEvent.setup();
  render(<Harness initial={fixture(count, labelLength)} tools={tools} />);
  return { user, tools };
};
const make = async (user) => {
  await user.click(screen.getByRole('button', { name: /^Make (a|the) link/ }));
  await waitFor(() => expect(screen.queryByTestId('share-result') ?? screen.queryByRole('alert')).toBeTruthy());
};
const linkText = () => screen.getByLabelText('Share link').value;

describe('the share link section (M5-03)', () => {
  it('shows the fixed privacy note before any link exists, and never calls a link private or secure (I-07)', () => {
    setup();
    expect(screen.getByTestId('share-privacy').textContent).toBe(SHARE_PRIVACY_NOTICE);
    const text = document.body.textContent;
    expect(text).not.toMatch(/\b(private link|secure|encrypted link|safe to share)\b/i);
    expect(text).toMatch(/It is not encrypted/);
  });

  it('makes a link that decodes to exactly the view, and shows its size', async () => {
    const { user } = setup();
    await make(user);
    const url = linkText();
    expect(url.startsWith(`${PAGE}#atlas=1.`)).toBe(true);
    const fragment = readFragment(new URL(url).hash);
    const decoded = await decodePayload(fragment.payload);
    expect(decoded.ok).toBe(true);
    expect(decoded.envelope.title).toBe('For friends');
    expect(decoded.envelope.groups[0].items.map((i) => i.label)).toEqual(['Thing 0', 'Thing 1']);
    expect(decoded.envelope.statement).toBe(CONSENT_NOTICE);
    expect(JSON.stringify(decoded.envelope)).not.toContain('ZZ-profile-title');
    expect(screen.getByTestId('share-result').dataset.band).toBe('target');
    expect(screen.getByText(/Link size: .* Short\./)).toBeTruthy();
  });

  it('copies the link, and says so', async () => {
    const { user, tools } = setup();
    await make(user);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(tools.copyText).toHaveBeenCalledWith(linkText());
    expect(screen.getByText('Link copied.')).toBeTruthy();
  });

  it('tells the person to copy by hand when the browser will not copy', async () => {
    const { user } = setup(2, 0, { copyText: vi.fn(async () => { throw new Error('denied'); }) });
    await make(user);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(screen.getByText(/could not be copied automatically\. Select it in the box/)).toBeTruthy();
    expect(linkText().length).toBeGreaterThan(20);
  });

  it('removes the link when the view changes, so it is never out of date', async () => {
    const { user } = setup();
    await make(user);
    expect(screen.getByLabelText('Share link')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Change the view' }));
    expect(screen.queryByLabelText('Share link')).toBeNull();
    expect(screen.getByText(/The view has changed since this link was made, so the link was removed/)).toBeTruthy();
    await make(user);
    expect(await decodePayload(readFragment(new URL(linkText()).hash).payload)).toMatchObject({ ok: true });
  });

  it('is not offered until something can be included', () => {
    render(<ShareLink profile={fixture().profile} view={{ ...fixture().view, includedItemIds: [] }} ready={false} now={() => NOW} announce={() => {}} onDownloadFile={() => {}} pageUrl={PAGE} />);
    expect(screen.getByRole('button', { name: 'Make a link' }).disabled).toBe(true);
  });

  it('warns that a long link may be cut short', async () => {
    const { user } = setup(60, 200); // about 10 KB
    await make(user);
    expect(screen.getByTestId('share-result').dataset.band).toBe('warning');
    expect(screen.getByTestId('share-advice').textContent).toMatch(/cut long links short|cut short/);
    expect(screen.queryByRole('button', { name: /instead/ })).toBeNull();
  });

  it('offers a file for a very long link, and still shows the link', async () => {
    const { user, tools } = setup(200, 200); // about 40 KB
    await make(user);
    expect(screen.getByTestId('share-result').dataset.band).toBe('strong');
    expect(screen.getByLabelText('Share link')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Download a Markdown file instead' }));
    expect(tools.onDownloadFile).toHaveBeenCalledTimes(1);
  });

  it('defaults to a file over 100 KB and hides the link until asked', async () => {
    const { user } = setup(800, 200); // about 160 KB
    await make(user);
    expect(screen.getByTestId('share-result').dataset.band).toBe('file');
    expect(screen.queryByLabelText('Share link')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download a Markdown file instead' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show the link anyway' }));
    expect(screen.getByLabelText('Share link')).toBeTruthy();
  });

  it('refuses a link past the size the app opens, and points to a file', async () => {
    const { user } = setup(1500, 200); // too large to open again
    await make(user);
    expect((await screen.findByRole('alert')).textContent).toMatch(/larger than the app opens.*Use a file instead\./);
    expect(screen.queryByLabelText('Share link')).toBeNull();
  });

  it('shows a QR code for a small link, drawn locally, that scans back to the link', async () => {
    const { user } = setup();
    await make(user);
    expect(screen.queryByTestId('share-qr')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show QR code' }));
    const svg = screen.getByRole('img', { name: /QR code for the share link/ });
    expect(svg.querySelector('path').getAttribute('d')).toMatch(/^M/);
    expect(svg.querySelector('image, script, a, foreignObject')).toBeNull();
    expect(screen.getByText(/Anyone who scans this code can open and read the chart/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hide QR code' }));
    expect(screen.queryByTestId('share-qr')).toBeNull();
  });

  it('offers no QR code for a link too long to scan well', async () => {
    const { user } = setup(30, 200); // about 5 KB
    await make(user);
    expect(screen.queryByRole('button', { name: /QR code/ })).toBeNull();
    expect(screen.getByTestId('share-no-qr').textContent).toMatch(/too long for a QR code/);
  });

  it('has no serious accessibility problems', async () => {
    const { user } = setup();
    await make(user);
    await user.click(screen.getByRole('button', { name: 'Show QR code' }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
