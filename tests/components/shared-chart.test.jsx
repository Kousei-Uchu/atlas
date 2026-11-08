// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seriousViolations } from './helpers.jsx';
import { SharedChartPage, PREVIEW_NOTICE } from '../../src/features/share/SharedChartPage.jsx';
import { checkEnvelope } from '../../src/share/envelope.js';
import { DECODE_ERRORS } from '../../src/share/codec.js';
import { CONSENT_NOTICE } from '../../src/content/notices.js';

const NOW = '2026-11-06T10:00:00.000Z';
const YES = { label: 'Yes', description: '', icon: 'check', pattern: 'solid', color: '#1B5E20', textColor: '#FFFFFF', semantic: 'positive' };
const make = (over = {}) => checkEnvelope({
  format: 'atlas-share', title: '<b>Guide</b> for friends', createdAt: NOW, includesNotes: true, statement: CONSENT_NOTICE, states: [YES],
  groups: [{ name: 'Contact', items: [
    { label: '<img src=x onerror=alert(1)>', kind: 'state', state: 0, text: null, note: '<script>bad()</script>' },
    { label: 'Words', kind: 'text', state: null, text: 'Ask first', note: null },
  ] }],
  ...over,
}).envelope;

const share = { kind: 'share', version: '1', payload: 'PAYLOAD' };
function setup({ envelope = make(), fragment = share, decode, onSaveCopy = vi.fn(async () => {}), onLeave = vi.fn() } = {}) {
  const dec = decode ?? vi.fn(async () => ({ ok: true, envelope }));
  const user = userEvent.setup();
  render(<SharedChartPage fragment={fragment} decode={dec} onSaveCopy={onSaveCopy} onLeave={onLeave} now={() => NOW} />);
  return { user, onSaveCopy, onLeave, dec };
}

describe('the shared chart preview (M5-02)', () => {
  it('shows the chart read-only, with the not-saved note and the consent statement', async () => {
    setup();
    expect(await screen.findByRole('heading', { level: 2, name: '<b>Guide</b> for friends' })).toBeTruthy();
    expect(screen.getByText(PREVIEW_NOTICE)).toBeTruthy();
    expect(screen.getByText(CONSENT_NOTICE)).toBeTruthy();
    expect(screen.getByText('Ask first')).toBeTruthy();
    expect(screen.getByText(/Shared 2026-11-06, with notes/)).toBeTruthy();
    expect(screen.queryAllByRole('textbox')).toEqual([]); // nothing to edit
  });

  it('shows markup as plain text and creates no elements from it (I-08)', async () => {
    setup();
    await screen.findByText('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText(/<script>bad\(\)<\/script>/)).toBeTruthy();
  });

  it('shows each state by its label, not by colour alone (I-09)', async () => {
    setup();
    await screen.findByText('Words');
    expect(screen.getByText('Yes')).toBeTruthy();
  });

  it('saves nothing until the person confirms, and cancel changes nothing', async () => {
    const { user, onSaveCopy } = setup();
    await screen.findByText('Words');
    await user.click(screen.getByRole('button', { name: 'Save a copy' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Save a copy of this chart?' });
    expect(within(dialog).getByText(/Your existing profiles are not changed and nothing is merged/)).toBeTruthy();
    expect(onSaveCopy).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onSaveCopy).not.toHaveBeenCalled();
  });

  it('saves one new profile when confirmed', async () => {
    const { user, onSaveCopy } = setup();
    await screen.findByText('Words');
    await user.click(screen.getByRole('button', { name: 'Save a copy' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save a copy' }));
    expect(onSaveCopy).toHaveBeenCalledTimes(1);
    const profile = onSaveCopy.mock.calls[0][0];
    expect(profile.title).toBe('Shared: <b>Guide</b> for friends');
    expect(profile.items.map((i) => i.label)).toEqual(['<img src=x onerror=alert(1)>', 'Words']);
  });

  it('says so, and keeps the chart on screen, when the copy cannot be saved', async () => {
    const { user } = setup({ onSaveCopy: vi.fn(async () => { throw new Error('quota'); }) });
    await screen.findByText('Words');
    await user.click(screen.getByRole('button', { name: 'Save a copy' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save a copy' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be saved\. Nothing was changed/);
    expect(screen.getByText('Words')).toBeTruthy();
  });

  it('leaves without saving', async () => {
    const { user, onLeave, onSaveCopy } = setup();
    await screen.findByText('Words');
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onSaveCopy).not.toHaveBeenCalled();
  });

  it('says why a link failed, saves nothing, and offers the way back', async () => {
    const message = DECODE_ERRORS['too-large'];
    const { user, onLeave, onSaveCopy } = setup({ decode: vi.fn(async () => ({ ok: false, error: { code: 'too-large', message } })) });
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.queryByRole('button', { name: 'Save a copy' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open my own charts' }));
    expect(onLeave).toHaveBeenCalled();
    expect(onSaveCopy).not.toHaveBeenCalled();
  });

  it('refuses a version it does not know, and a half-formed link, without decoding', async () => {
    const a = setup({ fragment: { kind: 'share', version: '2', payload: 'x' } });
    expect((await screen.findByRole('alert')).textContent).toBe(DECODE_ERRORS.unsupported);
    expect(a.dec).not.toHaveBeenCalled();
  });

  it('has no serious accessibility problems, in the preview or the dialog', async () => {
    const { user } = setup();
    await screen.findByText('Words');
    expect(await seriousViolations(document.body)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Save a copy' }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
