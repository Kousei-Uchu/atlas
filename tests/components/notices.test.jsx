// @vitest-environment jsdom
// M1-14 / M1-AC-11 / I-02: the fixed statements are word-for-word what the spec says,
// and are always on screen. Pinning the text here means a reword is a deliberate change.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { freshDb, renderAtlas } from './helpers.jsx';
import { CONSENT_NOTICE, LOCAL_STORAGE_NOTICE, NO_UPLOAD_NOTICE } from '../../src/content/notices.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

describe('fixed notice wording (spec 14.2)', () => {
  it('consent', () => {
    expect(CONSENT_NOTICE).toBe('A chart shows general preferences. It is not permission, and it does not replace asking. If someone says no or changes their mind, that comes first.');
  });
  it('local storage', () => {
    expect(LOCAL_STORAGE_NOTICE).toBe('Your charts are stored in this browser on this device. Clearing browser data, using private browsing, or switching device can remove them. Export a backup regularly. Other people who use this browser profile may be able to read them.');
  });
  it('no upload', () => {
    expect(NO_UPLOAD_NOTICE).toBe('Nothing you enter is sent anywhere. The app has no accounts and no analytics.');
  });
});

describe('notices are visible in the editor', () => {
  it('shows each as a labelled region, consent before the chart', async () => {
    await renderAtlas(db);
    const regions = ['Preferences are not consent', 'Where your data lives', 'Nothing is uploaded'];
    for (const name of regions) expect(screen.getByRole('region', { name })).toBeTruthy();
    const consent = screen.getByRole('region', { name: regions[0] });
    const firstItem = screen.getAllByRole('list')[0];
    expect(consent.compareDocumentPosition(firstItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
