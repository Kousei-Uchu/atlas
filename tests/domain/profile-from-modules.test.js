import { describe, it, expect } from 'vitest';
import { buildProfileFromModules } from '../../src/domain/profile-from-modules.js';
import { createBlankProfile } from '../../src/domain/defaults.js';
import { validateProfile } from '../../src/domain/validation.js';
import { getTemplate, TEMPLATES } from '../../src/content/templates/index.js';
import { moduleStatus } from '../../src/domain/module-commands.js';
import { LIMITS } from '../../src/domain/limits.js';

const NOW = '2026-10-26T10:00:00.000Z';
let counter = 0;
const makeId = (prefix) => { counter += 1; return `${prefix}_f${counter}`; };
const build = (over = {}) => buildProfileFromModules({
  id: 'profile_new', title: ' Fresh start ', templates: [getTemplate('communication'), getTemplate('personal-space')], makeId, ...over,
}, NOW);

describe('createBlankProfile', () => {
  it('has the default states and settings, and nothing else', () => {
    const p = createBlankProfile({ id: 'p1', now: NOW, title: 'Blank' });
    expect(p.categories).toEqual([]);
    expect(p.items).toEqual([]);
    expect(p.answers).toEqual([]);
    expect(p.metadata.templateIds).toEqual([]);
    expect(p.states.length).toBe(6);
    expect(p.settings.restrictedModulesAcknowledged).toBe(false);
    expect(validateProfile(p).ok).toBe(true);
  });
});

describe('buildProfileFromModules', () => {
  it('makes a new profile at revision 0 holding only the chosen modules, with no sample content', () => {
    const result = build();
    expect(result.ok).toBe(true);
    const p = result.profile;
    expect(p).toMatchObject({ id: 'profile_new', title: 'Fresh start', revision: 0, createdAt: NOW, updatedAt: NOW });
    expect(p.metadata.templateIds).toEqual(['communication', 'personal-space']);
    expect(p.categories.some((c) => c.origin?.templateId === 'starter')).toBe(false);
    expect(moduleStatus(p, 'communication').state).toBe('on');
    expect(moduleStatus(p, 'personal-space').state).toBe('on');
    expect(p.answers).toEqual([]);
    expect(validateProfile(p).ok).toBe(true);
  });

  it('puts the modules in the order they were chosen', () => {
    const p = build().profile;
    const orders = ['communication', 'personal-space'].map((id) => Math.min(...p.categories.filter((c) => c.origin.templateId === id).map((c) => c.sortOrder)));
    expect(orders[0]).toBeLessThan(orders[1]);
  });

  it('asks for a name, at least one module, and each module only once', () => {
    expect(build({ title: '   ' }).error).toBe('A profile needs a name.');
    expect(build({ title: 'x'.repeat(LIMITS.titleLength + 1) }).ok).toBe(false);
    expect(build({ templates: [] }).error).toBe('Choose at least one module.');
    expect(build({ templates: undefined }).ok).toBe(false);
    expect(build({ templates: [getTemplate('communication'), getTemplate('communication')] }).error).toBe('Each module can be chosen only once.');
  });

  it('refuses a module for adults without the note, and records the acknowledgement with it (D-009)', () => {
    const templates = [getTemplate('communication'), getTemplate('intimacy-boundaries')];
    expect(build({ templates }).ok).toBe(false);
    const result = build({ templates, acknowledgeAdult: true });
    expect(result.ok).toBe(true);
    expect(result.profile.settings.restrictedModulesAcknowledged).toBe(true);
    expect(moduleStatus(result.profile, 'intimacy-boundaries').state).toBe('on');
  });

  it('does not record the acknowledgement when no module for adults was chosen', () => {
    expect(build({ acknowledgeAdult: true }).profile.settings.restrictedModulesAcknowledged).toBe(false);
  });

  it('can hold every module at once', () => {
    const all = TEMPLATES.filter((t) => !t.isSample);
    const result = build({ templates: all, acknowledgeAdult: true });
    expect(result.ok).toBe(true);
    expect(validateProfile(result.profile).ok).toBe(true);
  });

  it('passes on any failure from adding a module', () => {
    const result = build({ makeId: () => 'bad id!' });
    expect(result).toEqual({ ok: false, error: 'Could not make a new identifier. Try again.' });
  });
});
