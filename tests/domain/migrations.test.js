// The migration harness on its own, with a made-up registry (M6-01; spec 9; I-12, I-14).
import { describe, it, expect } from 'vitest';
import { migrateProfile, MIGRATIONS } from '../../src/domain/migrations.js';

const to2 = (p) => { const { name, ...rest } = p; return { ...rest, title: name, schemaVersion: 2 }; };
const to3 = (p) => ({ ...p, extra: true, schemaVersion: 3 });
const registry = { 1: to2, 2: to3 };

describe('migrateProfile', () => {
  it('has no migrations while the schema is at version 1', () => {
    expect(Object.keys(MIGRATIONS)).toEqual([]);
  });

  it('returns a current record as it is, with no steps', () => {
    const rec = { schemaVersion: 3, title: 'x' };
    expect(migrateProfile(rec, { migrations: registry, target: 3 })).toEqual({ ok: true, profile: rec, from: 3, steps: 0 });
  });

  it('runs each step in order, one version at a time', () => {
    const order = [];
    const spy = { 1: (p) => { order.push(1); return to2(p); }, 2: (p) => { order.push(2); return to3(p); } };
    const r = migrateProfile({ schemaVersion: 1, name: 'Old' }, { migrations: spy, target: 3 });
    expect(order).toEqual([1, 2]);
    expect(r).toMatchObject({ ok: true, from: 1, steps: 2, profile: { schemaVersion: 3, title: 'Old', extra: true } });
  });

  it('never changes the record it was given', () => {
    const rec = { schemaVersion: 1, name: 'Old', nested: { list: [1, 2] } };
    const before = JSON.stringify(rec);
    const r = migrateProfile(rec, { migrations: { 1: (p) => { p.nested.list.push(3); p.name = 'changed'; return { ...p, schemaVersion: 2 }; } }, target: 2 });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(rec)).toBe(before);
  });

  it('stops at a missing step and says which one', () => {
    const r = migrateProfile({ schemaVersion: 1 }, { migrations: { 2: to3 }, target: 3 });
    expect(r).toMatchObject({ ok: false, code: 'missing-migration' });
    expect(r.detail).toMatch(/from version 1 to 2/);
  });

  it('fails the whole migration when a step throws, and returns nothing half-done', () => {
    const r = migrateProfile({ schemaVersion: 1, name: 'x' }, { migrations: { 1: to2, 2: () => { throw new Error('boom'); } }, target: 3 });
    expect(r).toEqual({ ok: false, code: 'migration-failed', detail: 'The migration from version 2 to 3 failed.' });
  });

  it.each([
    ['null', null], ['a list', []], ['the wrong version', { schemaVersion: 5 }], ['no version', { title: 'x' }], ['a string', 'x'],
  ])('fails when a step returns %s', (_name, value) => {
    const r = migrateProfile({ schemaVersion: 1 }, { migrations: { 1: () => value }, target: 2 });
    expect(r).toMatchObject({ ok: false, code: 'migration-failed' });
  });

  it('does not touch newer data (I-14)', () => {
    expect(migrateProfile({ schemaVersion: 4 }, { migrations: registry, target: 3 })).toMatchObject({ ok: false, code: 'newer-version' });
  });

  it.each([[undefined], [null], ['1'], [0], [-1], [1.5], [NaN]])('refuses a record with schemaVersion %s', (v) => {
    expect(migrateProfile({ schemaVersion: v }, { migrations: registry, target: 3 })).toMatchObject({ ok: false, code: 'not-versioned' });
  });

  it('refuses things that are not records', () => {
    for (const v of [null, undefined, 3, 'x', []]) expect(migrateProfile(v, { migrations: registry, target: 3 }).ok).toBe(false);
  });
});
