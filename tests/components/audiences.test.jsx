// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seriousViolations } from './helpers.jsx';
import { AudiencesPanel } from '../../src/features/audiences/AudiencesPanel.jsx';
import { ItemAudiences } from '../../src/features/audiences/ItemAudiences.jsx';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { addAudience, setOverride } from '../../src/domain/audience-commands.js';
import { setItemState } from '../../src/domain/commands.js';
import { addView } from '../../src/domain/view-commands.js';
import { validateProfile } from '../../src/domain/validation.js';

const NOW = '2026-10-26T10:00:00.000Z';
const must = (r) => { expect(r.ok, r.error).toBe(true); return r.profile; };

function seed(build = (p) => p) {
  let p = createStarterProfile({ id: 'p1', now: NOW });
  const item = p.items.find((i) => i.type === 'state');
  p = must(setItemState(p, { itemId: item.id, stateId: 'yes' }, NOW));
  return { profile: build(p, item), item };
}

let latest = null;
function Harness({ initial, itemId }) {
  const [profile, setProfile] = useState(initial);
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  latest = profile;
  const run = (command, args) => {
    const result = command(profile, args, NOW);
    if (result.ok) { setProfile(result.profile); setError(''); } else setError(result.error);
    return result;
  };
  const item = profile.items.find((i) => i.id === itemId);
  return (
    <>
      <AudiencesPanel profile={profile} run={run} announce={setSaid} />
      {profile.audiences.length > 0 && <ItemAudiences profile={profile} item={item} run={run} announce={setSaid} />}
      <p data-testid="said">{said}</p>
      <p data-testid="error">{error}</p>
    </>
  );
}

const setup = (build) => {
  const { profile, item } = seed(build);
  const user = userEvent.setup();
  render(<Harness initial={profile} itemId={item.id} />);
  return { user, item };
};
const withFriends = (p) => must(addAudience(p, { id: 'aud_1', name: 'Friends', type: 'friends', description: 'People I know well' }, NOW));
const openPanel = (user) => user.click(screen.getByRole('button', { name: /^Open audiences/ }));
const said = () => screen.getByTestId('said').textContent;

describe('audiences panel (M4-03)', () => {
  it('is closed at first, and says there are none yet when opened', async () => {
    const { user } = setup();
    expect(screen.getByRole('button', { name: /^Open audiences/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('No audiences yet.')).toBeNull();
    await openPanel(user);
    expect(screen.getByText('No audiences yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add audience' }).disabled).toBe(true);
  });

  it('adds an audience with a kind and a description, and announces it', async () => {
    const { user } = setup();
    await openPanel(user);
    await user.type(screen.getByLabelText('Name of the audience'), '  My partner ');
    await user.selectOptions(screen.getByLabelText('Kind of audience'), 'partner');
    await user.type(screen.getByLabelText('Description (optional)'), 'Close');
    await user.click(screen.getByRole('button', { name: 'Add audience' }));
    expect(said()).toBe('Added the audience My partner');
    expect(latest.audiences).toMatchObject([{ name: 'My partner', type: 'partner', description: 'Close', parentId: null }]);
    expect(within(screen.getByRole('listitem', { name: 'My partner' })).getByText('Partner. Close')).toBeTruthy();
    expect(screen.getByLabelText('Name of the audience').value).toBe(''); // ready for the next one
    expect(validateProfile(latest).ok).toBe(true);
  });

  it('refuses a name that is already used, and changes nothing', async () => {
    const { user } = setup(withFriends);
    await openPanel(user);
    await user.type(screen.getByLabelText('Name of the audience'), 'friends');
    await user.click(screen.getByRole('button', { name: 'Add audience' }));
    expect(screen.getByTestId('error').textContent).toMatch(/already an audience called/);
    expect(latest.audiences).toHaveLength(1);
  });

  it('edits an audience, and cancel changes nothing', async () => {
    const { user } = setup(withFriends);
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Edit Friends' }));
    await user.clear(screen.getAllByLabelText('Name of the audience')[0]);
    await user.type(screen.getAllByLabelText('Name of the audience')[0], 'Old friends');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(latest.audiences[0].name).toBe('Friends');
    await user.click(screen.getByRole('button', { name: 'Edit Friends' }));
    await user.clear(screen.getAllByLabelText('Name of the audience')[0]);
    await user.type(screen.getAllByLabelText('Name of the audience')[0], 'Old friends');
    await user.selectOptions(screen.getAllByLabelText('Kind of audience')[0], 'close-friends');
    await user.click(screen.getByRole('button', { name: 'Save audience' }));
    expect(latest.audiences[0]).toMatchObject({ name: 'Old friends', type: 'close-friends' });
    expect(said()).toBe('Saved Old friends');
  });

  it('asks before deleting, says how many overrides go, and keeps the answer', async () => {
    const { user, item } = setup((p, it) => must(setOverride(withFriends(p), { id: 'ov_1', itemId: it.id, audienceId: 'aud_1', stateId: 'no' }, NOW)));
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Delete Friends' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Friends?' });
    expect(within(dialog).getByText(/its 1 override\. Your own answers are not changed/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(latest.audiences).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Delete Friends' }));
    await user.click(screen.getByRole('button', { name: 'Delete audience' }));
    expect(latest.audiences).toEqual([]);
    expect(latest.overrides).toEqual([]);
    expect(latest.answers.find((a) => a.itemId === item.id).stateId).toBe('yes');
    expect(said()).toBe('Deleted Friends. 1 override removed. Your answers are not changed.');
  });

  it('refuses to delete an audience a view uses, and says so', async () => {
    const { user } = setup((p) => must(addView(withFriends(p), { id: 'view_1', name: 'For friends', audienceId: 'aud_1' }, NOW)));
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Delete Friends' }));
    await user.click(screen.getByRole('button', { name: 'Delete audience' }));
    expect(latest.audiences).toHaveLength(1);
    expect(screen.getByTestId('error').textContent).toMatch(/A view uses this audience: “For friends”/);
  });

  it('lists an audience’s overrides with the reason, can turn one off, and can remove one', async () => {
    const { user } = setup((p, it) => must(setOverride(withFriends(p), { id: 'ov_1', itemId: it.id, audienceId: 'aud_1', stateId: 'no', explanation: 'Too personal' }, NOW)));
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Show overrides for Friends' }));
    const card = within(screen.getByRole('listitem', { name: 'Friends' }));
    expect(card.getByText(/Friends sees No because of an override\. Your own answer is Yes\. Your reason: Too personal/)).toBeTruthy();
    await user.click(card.getByRole('checkbox'));
    expect(latest.overrides[0].enabled).toBe(false);
    expect(card.getByText(/This override is off, so it is not used\./)).toBeTruthy();
    await user.click(card.getByRole('button', { name: /^Remove/ }));
    expect(latest.overrides).toEqual([]);
    expect(card.getByText('No overrides. Friends sees your own answers.')).toBeTruthy();
  });

  it('warns when an override shows more than the person’s own answer', async () => {
    const { user } = setup((p, it) => {
      let q = must(setItemState(p, { itemId: it.id, stateId: 'no' }, NOW));
      return must(setOverride(withFriends(q), { id: 'ov_1', itemId: it.id, audienceId: 'aud_1', stateId: 'yes' }, NOW));
    });
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Show overrides for Friends' }));
    expect(screen.getAllByText(/This shows more than your own answer does\./).length).toBeGreaterThan(0);
  });
});

describe('conflicts (D-042)', () => {
  const conflicted = (p, it) => ({
    ...withFriends(p),
    overrides: [
      { id: 'ov_a', itemId: it.id, audienceId: 'aud_1', stateId: 'yes', enabled: true, explanation: 'Because A' },
      { id: 'ov_b', itemId: it.id, audienceId: 'aud_1', stateId: 'no', enabled: true, explanation: 'Because B' },
    ],
  });

  it('says there is a conflict even while the panel is closed', () => {
    setup(conflicted);
    expect(screen.getByText('1 override conflict needs your attention.')).toBeTruthy();
  });

  it('shows what each override says, chooses nothing, and keeps the one the person picks', async () => {
    const { user } = setup(conflicted);
    await openPanel(user);
    const box = within(screen.getByTestId('conflicts'));
    expect(box.getByText(/Nothing is chosen for you/)).toBeTruthy();
    expect(box.getByText(/Reason: Because A/)).toBeTruthy();
    expect(box.getByText(/Reason: Because B/)).toBeTruthy();
    await user.click(box.getByRole('button', { name: /^Keep No/ }));
    expect(latest.overrides).toHaveLength(1);
    expect(latest.overrides[0]).toMatchObject({ stateId: 'no', explanation: 'Because B', enabled: true });
    expect(screen.queryByTestId('conflicts')).toBeNull();
    expect(said()).toMatch(/^Kept No for Friends on /);
  });

  it('tells the item’s own section that the overrides disagree, and lets a choice settle it', async () => {
    const { user } = setup(conflicted);
    const select = screen.getByRole('combobox', { name: /Friends.*sees/ });
    expect(select.value).toBe('__conflict');
    expect(screen.getByTestId('audience-effect').textContent).toMatch(/overrides that disagree/);
    await user.selectOptions(select, 'unsure');
    expect(latest.overrides).toHaveLength(1);
    expect(latest.overrides[0].stateId).toBe('unsure');
  });
});

describe('the section inside an item (M4-03)', () => {
  it('shows the person’s own answer when nothing is set, and sets and clears an override without touching the answer (I-04)', async () => {
    const { user, item } = setup(withFriends);
    const select = screen.getByRole('combobox', { name: /Friends.*sees/ });
    expect(select.value).toBe('');
    expect(screen.getByTestId('audience-effect').textContent).toBe('Friends sees Yes, which is your own answer. No override applies.');

    await user.selectOptions(select, 'conditional');
    expect(latest.overrides).toMatchObject([{ itemId: item.id, audienceId: 'aud_1', stateId: 'conditional', enabled: true }]);
    expect(screen.getByTestId('audience-effect').textContent).toMatch(/Friends sees Conditional because of an override\. Your own answer is Yes\./);
    expect(said()).toMatch(/^Friends now sees Conditional for /);
    expect(latest.answers.find((a) => a.itemId === item.id).stateId).toBe('yes');

    await user.selectOptions(select, '');
    expect(latest.overrides).toEqual([]);
    expect(said()).toMatch(/^Friends now sees your own answer for /);
    expect(latest.answers.find((a) => a.itemId === item.id).stateId).toBe('yes');
  });

  it('keeps a reason with the override, and a changed state keeps the reason', async () => {
    const { user } = setup(withFriends);
    await user.selectOptions(screen.getByRole('combobox', { name: /Friends.*sees/ }), 'no');
    await user.type(screen.getByLabelText('Reason for Friends (optional)'), 'Private');
    expect(latest.overrides[0].explanation).toBe('Private');
    await user.selectOptions(screen.getByRole('combobox', { name: /Friends.*sees/ }), 'unsure');
    expect(latest.overrides[0]).toMatchObject({ stateId: 'unsure', explanation: 'Private' });
    expect(latest.overrides).toHaveLength(1);
  });

  it('can offer Unanswered to an audience, which is never a yes', async () => {
    const { user } = setup(withFriends);
    await user.selectOptions(screen.getByRole('combobox', { name: /Friends.*sees/ }), 'unanswered');
    expect(latest.overrides[0].stateId).toBe('unanswered');
    expect(screen.getByTestId('audience-effect').textContent).toMatch(/Friends sees Unanswered/);
  });
});

describe('accessibility', () => {
  it('has no serious problems with the panel open, a card showing overrides, and an item section', async () => {
    const { user } = setup((p, it) => must(setOverride(withFriends(p), { id: 'ov_1', itemId: it.id, audienceId: 'aud_1', stateId: 'no' }, NOW)));
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Show overrides for Friends' }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
