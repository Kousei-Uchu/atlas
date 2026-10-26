import { describe, it, expect } from 'vitest';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { setEndBehaviour, setPrimaryDirection } from '../../src/domain/settings-commands.js';
import { stepItemState } from '../../src/domain/commands.js';
import { validateProfile } from '../../src/domain/validation.js';
import { parseBackupText, serialiseBackup } from '../../src/storage/backup.js';

const NOW = '2026-10-26T10:00:00.000Z';
const LATER = '2026-10-26T11:00:00.000Z';

function profileWithAnswer(stateId) {
  const base = createStarterProfile({ id: 'p1', title: 'T', now: NOW });
  const item = base.items.find((i) => i.type === 'state');
  const answers = stateId ? [{ itemId: item.id, stateId, noteShareable: false }] : [];
  return { profile: { ...base, answers }, itemId: item.id };
}

describe('setEndBehaviour', () => {
  it('changes the setting and stamps updatedAt', () => {
    const { profile } = profileWithAnswer();
    const result = setEndBehaviour(profile, { endBehaviour: 'loop' }, LATER);
    expect(result.ok).toBe(true);
    expect(result.profile.settings.cycle.endBehaviour).toBe('loop');
    expect(result.profile.updatedAt).toBe(LATER);
  });

  it('returns the same profile when nothing changes', () => {
    const { profile } = profileWithAnswer();
    const result = setEndBehaviour(profile, { endBehaviour: 'clamp' }, LATER);
    expect(result.ok).toBe(true);
    expect(result.profile).toBe(profile);
  });

  it.each(['wrap', '', null, undefined, 3])('rejects %s', (value) => {
    const { profile } = profileWithAnswer();
    const result = setEndBehaviour(profile, { endBehaviour: value }, LATER);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/stop or go around/);
  });

  it('does not change its input and keeps the result valid', () => {
    const { profile } = profileWithAnswer();
    const before = JSON.stringify(profile);
    const result = setEndBehaviour(profile, { endBehaviour: 'loop' }, LATER);
    expect(JSON.stringify(profile)).toBe(before);
    expect(validateProfile(result.profile).ok).toBe(true);
  });
});

describe('setPrimaryDirection', () => {
  it('changes the setting and stamps updatedAt', () => {
    const { profile } = profileWithAnswer();
    const result = setPrimaryDirection(profile, { primaryDirection: 'positive' }, LATER);
    expect(result.ok).toBe(true);
    expect(result.profile.settings.interaction.primaryDirection).toBe('positive');
    expect(result.profile.updatedAt).toBe(LATER);
  });

  it('returns the same profile when nothing changes', () => {
    const { profile } = profileWithAnswer();
    expect(setPrimaryDirection(profile, { primaryDirection: 'negative' }, LATER).profile).toBe(profile);
  });

  it.each(['up', '', null, undefined])('rejects %s', (value) => {
    const { profile } = profileWithAnswer();
    expect(setPrimaryDirection(profile, { primaryDirection: value }, LATER).ok).toBe(false);
  });

  it('keeps the other settings as they were', () => {
    const { profile } = profileWithAnswer();
    const looped = setEndBehaviour(profile, { endBehaviour: 'loop' }, LATER).profile;
    const result = setPrimaryDirection(looped, { primaryDirection: 'positive' }, LATER).profile;
    expect(result.settings.cycle.endBehaviour).toBe('loop');
    expect(result.settings.interaction.primaryDirection).toBe('positive');
  });

  it('never touches an answer (I-03)', () => {
    const { profile } = profileWithAnswer('yes');
    const result = setPrimaryDirection(profile, { primaryDirection: 'positive' }, LATER).profile;
    expect(result.answers).toBe(profile.answers);
    expect(result.states).toBe(profile.states);
  });
});

describe('what the settings do to a click', () => {
  it('a primary click goes the other way once the direction is flipped', () => {
    const { profile, itemId } = profileWithAnswer();
    const flipped = setPrimaryDirection(profile, { primaryDirection: 'positive' }, LATER).profile;
    const normal = stepItemState(profile, { itemId, action: 'primary' }, LATER).profile;
    const reversed = stepItemState(flipped, { itemId, action: 'primary' }, LATER).profile;
    expect(normal.answers[0].stateId).toBe('unsure');
    expect(reversed.answers[0].stateId).toBe('conditional');
  });

  it('a secondary click follows the flip too', () => {
    const { profile, itemId } = profileWithAnswer();
    const flipped = setPrimaryDirection(profile, { primaryDirection: 'positive' }, LATER).profile;
    const result = stepItemState(flipped, { itemId, action: 'secondary' }, LATER).profile;
    expect(result.answers[0].stateId).toBe('unsure');
  });

  it('clamp stops at the end and loop goes around', () => {
    const { profile, itemId } = profileWithAnswer('yes');
    const stopped = stepItemState(profile, { itemId, action: 'secondary' }, LATER);
    expect(stopped.clamped).toBe(true);
    expect(stopped.profile).toBe(profile);

    const looped = setEndBehaviour(profile, { endBehaviour: 'loop' }, LATER).profile;
    const wrapped = stepItemState(looped, { itemId, action: 'secondary' }, LATER);
    expect(wrapped.clamped).toBe(false);
    expect(wrapped.profile.answers[0].stateId).toBe('no');
  });
});

describe('the settings travel with a backup (M2-09)', () => {
  it('survive export and import', () => {
    const { profile } = profileWithAnswer();
    const changed = setEndBehaviour(setPrimaryDirection(profile, { primaryDirection: 'positive' }, LATER).profile, { endBehaviour: 'loop' }, LATER).profile;
    const parsed = parseBackupText(serialiseBackup(changed, LATER));
    expect(parsed.ok).toBe(true);
    expect(parsed.profile.settings.interaction.primaryDirection).toBe('positive');
    expect(parsed.profile.settings.cycle.endBehaviour).toBe('loop');
  });
});
