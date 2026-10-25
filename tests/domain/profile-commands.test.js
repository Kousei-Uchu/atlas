import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { renameProfile, duplicateProfile, copyTitle } from '../../src/domain/profile-commands.js';
import { setItemState } from '../../src/domain/commands.js';
import { validateProfile } from '../../src/domain/validation.js';
import { LIMITS } from '../../src/domain/limits.js';

const T0 = '2026-10-26T09:00:00.000Z';
const T1 = '2026-10-26T10:00:00.000Z';
const base = () => ({ ...createStarterProfile({ id: 'p1', now: T0, title: 'Mine' }), revision: 7 });

describe('renameProfile', () => {
  it('trims and renames, stamping updatedAt', () => {
    const r = renameProfile(base(), { title: '  Work me  ' }, T1);
    expect(r.ok).toBe(true);
    expect(r.profile.title).toBe('Work me');
    expect(r.profile.updatedAt).toBe(T1);
  });
  it('returns the same profile when the name is unchanged', () => {
    const p = base();
    expect(renameProfile(p, { title: 'Mine' }, T1).profile).toBe(p);
  });
  it('refuses an empty, blank or over-long name', () => {
    expect(renameProfile(base(), { title: '   ' }, T1).ok).toBe(false);
    expect(renameProfile(base(), { title: 5 }, T1).ok).toBe(false);
    expect(renameProfile(base(), { title: 'x'.repeat(LIMITS.titleLength + 1) }, T1).ok).toBe(false);
  });
});

describe('duplicateProfile', () => {
  it('copies everything under a new id at revision 0, titled Copy of', () => {
    let p = setItemState(base(), { itemId: 'starter_hug', stateId: 'yes' }, T0).profile;
    p = { ...p, revision: 7 };
    const r = duplicateProfile(p, { id: 'p2' }, T1);
    expect(r.ok).toBe(true);
    expect(r.profile).toMatchObject({ id: 'p2', title: 'Copy of Mine', revision: 0, createdAt: T1, updatedAt: T1 });
    expect(r.profile.answers).toEqual(p.answers);
    expect(r.profile.items).toEqual(p.items);
    expect(r.profile.states).toEqual(p.states);
    expect(validateProfile(r.profile).ok).toBe(true);
  });
  it('does not change the original (I-05)', () => {
    const p = base();
    const before = JSON.stringify(p);
    Object.freeze(p);
    duplicateProfile(p, { id: 'p2' }, T1);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('accepts a chosen title and refuses a reused id', () => {
    expect(duplicateProfile(base(), { id: 'p2', title: ' Trial ' }, T1).profile.title).toBe('Trial');
    expect(duplicateProfile(base(), { id: 'p1' }, T1).ok).toBe(false);
    expect(duplicateProfile(base(), { id: '' }, T1).ok).toBe(false);
  });
  it('keeps a long title inside the limit', () => {
    const long = 'x'.repeat(LIMITS.titleLength);
    expect(copyTitle(long).length).toBeLessThanOrEqual(LIMITS.titleLength);
    expect(copyTitle(long).startsWith('Copy of ')).toBe(true);
  });
});
