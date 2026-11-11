import { describe, expect, it } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { deleteItem, setItemNote, setItemState } from '../../src/domain/commands.js';
import { deleteAllSnapshots, deleteSnapshot, renameSnapshot, snapshotEntries, takeSnapshot } from '../../src/domain/snapshot-commands.js';
import { changeCount, diffEntries, profileFromSnapshot, timeline } from '../../src/domain/timeline.js';
import { validateProfile } from '../../src/domain/validation.js';
import { LIMITS } from '../../src/domain/limits.js';

const T0 = '2026-11-01T00:00:00.000Z';
const T1 = '2026-11-02T00:00:00.000Z';
const T2 = '2026-11-03T00:00:00.000Z';
const must = (r) => { if (!r.ok) throw new Error(r.error); return r.profile; };
const start = () => createStarterProfile({ id: 'profile_a', title: 'Mine', now: T0 });
const itemIds = (p) => p.items.filter((i) => i.type === 'state').map((i) => i.id);

function answered() {
  let p = start();
  const [a, b, c] = itemIds(p);
  p = must(setItemState(p, { itemId: a, stateId: 'yes' }, T0));
  p = must(setItemState(p, { itemId: b, stateId: 'no' }, T0));
  p = must(setItemNote(p, { itemId: a, note: 'a note that must never be copied' }, T0));
  return { p, a, b, c };
}

describe('taking a snapshot', () => {
  it('keeps only answered state questions, with names, and never notes or text (I-01)', () => {
    const { p, a, b } = answered();
    const taken = must(takeSnapshot(p, { id: 'snapshot_1', label: 'First' }, T1));
    const [snap] = taken.snapshots;
    expect(snap).toMatchObject({ id: 'snapshot_1', label: 'First', takenAt: T1 });
    expect(snap.entries.map((e) => [e.itemId, e.stateId])).toEqual([[a, 'yes'], [b, 'no']]);
    expect(snap.entries[0]).toMatchObject({ stateLabel: 'Yes' });
    expect(JSON.stringify(snap)).not.toContain('must never be copied');
    expect(Object.keys(snap.entries[0]).sort()).toEqual(['categoryName', 'itemId', 'label', 'stateId', 'stateLabel']);
    expect(validateProfile(taken).ok).toBe(true);
  });

  it('refuses with nothing answered, a blank or repeated name, a bad id and a full list', () => {
    expect(takeSnapshot(start(), { id: 'snapshot_1', label: 'x' }, T1)).toMatchObject({ ok: false, error: expect.stringMatching(/no answers/) });
    const { p } = answered();
    expect(takeSnapshot(p, { id: 'snapshot_1', label: '  ' }, T1)).toMatchObject({ ok: false, error: 'A snapshot needs a name.' });
    expect(takeSnapshot(p, { id: 'bad id', label: 'x' }, T1).ok).toBe(false);
    const one = must(takeSnapshot(p, { id: 'snapshot_1', label: 'First' }, T1));
    expect(takeSnapshot(one, { id: 'snapshot_2', label: 'first' }, T2)).toMatchObject({ ok: false, error: expect.stringMatching(/already a snapshot/) });
    expect(takeSnapshot(one, { id: 'snapshot_1', label: 'Other' }, T2).ok).toBe(false);
    let full = p;
    for (let i = 0; i < LIMITS.snapshots; i += 1) full = must(takeSnapshot(full, { id: `snapshot_${i}`, label: `S${i}` }, T1));
    expect(takeSnapshot(full, { id: 'snapshot_x', label: 'One more' }, T2)).toMatchObject({ ok: false, error: expect.stringMatching(/Delete an older one/) });
  });

  it('is not changed by later answers, and survives the item being deleted', () => {
    const { p, a } = answered();
    let q = must(takeSnapshot(p, { id: 'snapshot_1', label: 'First' }, T1));
    q = must(setItemState(q, { itemId: a, stateId: 'no' }, T2));
    expect(q.snapshots[0].entries.find((e) => e.itemId === a).stateId).toBe('yes');
    q = must(deleteItem(q, { id: a }, T2));
    expect(q.snapshots[0].entries.find((e) => e.itemId === a)).toMatchObject({ stateLabel: 'Yes' });
    expect(validateProfile(q).ok).toBe(true);
  });
});

describe('rename and delete', () => {
  it('renames, deletes one, deletes all, and says so when there is nothing', () => {
    const { p } = answered();
    let q = must(takeSnapshot(p, { id: 'snapshot_1', label: 'First' }, T1));
    q = must(takeSnapshot(q, { id: 'snapshot_2', label: 'Second' }, T2));
    expect(must(renameSnapshot(q, { id: 'snapshot_1', label: 'Renamed' }, T2)).snapshots[0].label).toBe('Renamed');
    expect(renameSnapshot(q, { id: 'snapshot_1', label: 'Second' }, T2).ok).toBe(false);
    expect(renameSnapshot(q, { id: 'nope', label: 'x' }, T2).ok).toBe(false);
    expect(must(deleteSnapshot(q, { id: 'snapshot_1' }, T2)).snapshots.map((s) => s.id)).toEqual(['snapshot_2']);
    expect(deleteSnapshot(q, { id: 'nope' }, T2).ok).toBe(false);
    expect(must(deleteAllSnapshots(q, {}, T2)).snapshots).toEqual([]);
    expect(deleteAllSnapshots(start(), {}, T2).ok).toBe(false);
  });
});

describe('the timeline', () => {
  it('lists snapshots oldest first, then now, with counts of what changed and no judgement', () => {
    const { p, a, b, c } = answered();
    let q = must(takeSnapshot(p, { id: 'snapshot_1', label: 'First' }, T1));
    q = must(setItemState(q, { itemId: a, stateId: 'no' }, T1));   // changed
    q = must(setItemState(q, { itemId: c, stateId: 'unsure' }, T1)); // newly answered
    q = must(setItemState(q, { itemId: b, stateId: 'unanswered' }, T1)); // cleared
    const points = timeline(q);
    expect(points.map((x) => x.key)).toEqual(['snapshot_1', 'now']);
    expect(points[0].changesSincePrevious).toBeNull();
    expect(points[1].changesSincePrevious).toBe(3);
    const d = diffEntries(points[0].entries, points[1].entries);
    expect(d.changed.map((x) => [x.before.stateId, x.after.stateId])).toEqual([['yes', 'no']]);
    expect(d.newlyAnswered.map((e) => e.itemId)).toEqual([c]);
    expect(d.cleared.map((e) => e.itemId)).toEqual([b]);
    expect(changeCount(d)).toBe(3);
  });

  it('puts snapshots in time order whatever order they were stored in', () => {
    const { p } = answered();
    let q = must(takeSnapshot(p, { id: 'snapshot_b', label: 'Later' }, T2));
    q = must(takeSnapshot(q, { id: 'snapshot_a', label: 'Earlier' }, T1));
    expect(timeline(q).map((x) => x.key)).toEqual(['snapshot_a', 'snapshot_b', 'now']);
  });
});

describe('a new profile from a snapshot (I-12)', () => {
  it('has the snapshot answers, no notes, text, overrides, views or history, and leaves the original alone', () => {
    const { p, a, b } = answered();
    let q = must(takeSnapshot(p, { id: 'snapshot_1', label: 'First' }, T1));
    q = must(setItemState(q, { itemId: a, stateId: 'no' }, T2));
    const before = JSON.stringify(q);
    const made = profileFromSnapshot(q, 'snapshot_1', { id: 'profile_new' }, T2);
    expect(made.ok).toBe(true);
    expect(made.profile).toMatchObject({ id: 'profile_new', title: 'Mine (as at First)', revision: 0, snapshots: [], overrides: [], views: [] });
    expect(made.profile.answers.map((x) => [x.itemId, x.stateId]).sort()).toEqual([[a, 'yes'], [b, 'no']].sort());
    expect(JSON.stringify(made.profile)).not.toContain('must never be copied');
    expect(made.skipped).toBe(0);
    expect(validateProfile(made.profile).ok).toBe(true);
    expect(JSON.stringify(q)).toBe(before);
  });

  it('skips answers whose item is gone, and says how many; refuses an unknown snapshot or a reused id', () => {
    const { p, a } = answered();
    let q = must(takeSnapshot(p, { id: 'snapshot_1', label: 'First' }, T1));
    q = must(deleteItem(q, { id: a }, T2));
    const made = profileFromSnapshot(q, 'snapshot_1', { id: 'profile_new' }, T2);
    expect(made).toMatchObject({ ok: true, skipped: 1 });
    expect(validateProfile(made.profile).ok).toBe(true);
    expect(profileFromSnapshot(q, 'nope', { id: 'profile_new' }, T2).ok).toBe(false);
    expect(profileFromSnapshot(q, 'snapshot_1', { id: 'profile_a' }, T2).ok).toBe(false);
  });
});

describe('what snapshotEntries leaves out', () => {
  it('skips unanswered items and text items', () => {
    expect(snapshotEntries(start())).toEqual([]);
  });
});
