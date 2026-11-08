// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seriousViolations } from './helpers.jsx';
import { ModulesPanel } from '../../src/features/modules/ModulesPanel.jsx';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateTemplate } from '../../src/domain/templates.js';
import { MATURE_PHRASING_NOTICE } from '../../src/content/notices.js';

// Adding a module renders dozens of rows, which is slow in jsdom.
vi.setConfig({ testTimeout: 60000 });

const NOW = '2026-10-26T10:00:00.000Z';
const adult = validateTemplate({
  templateId: 'adult-test', version: 1, title: 'Adult test module', summary: 'For tests only.',
  defaultVisibility: 'hidden', adultIntended: true, isSample: false, statement: 'preferences-not-consent',
  categories: [{
    key: 'r', name: 'Restricted things', sensitivity: 'restricted',
    items: [{ key: 'r1', label: 'A general thing', mature: { label: 'A direct thing' } }, { key: 'r2', label: 'Same either way' }],
  }],
}).template;
const plain = validateTemplate({
  templateId: 'plain-test', version: 1, title: 'Plain test module', summary: 'For tests only.',
  defaultVisibility: 'visible', adultIntended: false, isSample: false, statement: 'preferences-not-consent',
  categories: [{ key: 'p', name: 'Plain things', sensitivity: 'normal', items: [{ key: 'p1', label: 'A plain thing' }] }],
}).template;

function Harness({ templates }) {
  const [profile, setProfile] = useState(() => createStarterProfile({ id: 'p1', now: NOW }));
  const [said, setSaid] = useState('');
  const run = (command, args) => {
    const result = command(profile, args, NOW);
    if (result.ok) setProfile(result.profile);
    return result;
  };
  return (
    <>
      <ModulesPanel profile={profile} run={run} announce={setSaid} templates={templates} />
      <p data-testid="setting">{String(profile.settings.maturePhrasing)}</p>
      <p data-testid="said">{said}</p>
      <ul data-testid="labels">{profile.items.filter((i) => i.origin?.templateId === 'adult-test').map((i) => <li key={i.id}>{i.label}</li>)}</ul>
    </>
  );
}

const setup = async (templates = [adult, plain]) => {
  const user = userEvent.setup();
  render(<Harness templates={templates} />);
  await user.click(screen.getByRole('button', { name: 'Open module library' }));
  return user;
};
const labels = () => within(screen.getByTestId('labels')).queryAllByRole('listitem').map((li) => li.textContent);
const addAdult = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Add Adult test module' }));
  await user.click(screen.getByRole('button', { name: 'Turn on module' }));
};

describe('mature phrasing choice (D-043)', () => {
  it('offers general wording first, with mature phrasing off', async () => {
    await setup();
    const group = screen.getByRole('group', { name: 'Wording in adult modules' });
    expect(within(group).getByRole('radio', { name: 'General wording' }).checked).toBe(true);
    expect(within(group).getByRole('radio', { name: 'Mature phrasing' }).checked).toBe(false);
    expect(screen.getByTestId('setting').textContent).toBe('false');
  });

  it('is not offered when no module has a mature wording, because it would do nothing', async () => {
    await setup([plain]);
    expect(screen.queryByRole('group', { name: 'Wording in adult modules' })).toBeNull();
  });

  it('shows the note first, and changes nothing if the person cancels', async () => {
    const user = await setup();
    await addAdult(user);
    await user.click(screen.getByRole('radio', { name: 'Mature phrasing' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Turn on mature phrasing?' });
    expect(within(dialog).getByText(MATURE_PHRASING_NOTICE)).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('radio', { name: 'General wording' }).checked).toBe(true);
    expect(screen.getByTestId('setting').textContent).toBe('false');
    expect(labels()).toEqual(['A general thing', 'Same either way']);
  });

  it('cancels with Escape too', async () => {
    const user = await setup();
    await user.click(screen.getByRole('radio', { name: 'Mature phrasing' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('setting').textContent).toBe('false');
  });

  it('rewords the module once the note is accepted, says how many entries changed, and can go back', async () => {
    const user = await setup();
    await addAdult(user);
    await user.click(screen.getByRole('radio', { name: 'Mature phrasing' }));
    await user.click(screen.getByRole('button', { name: 'Turn on mature phrasing' }));
    expect(screen.getByTestId('setting').textContent).toBe('true');
    expect(labels()).toEqual(['A direct thing', 'Same either way']);
    expect(screen.getByTestId('said').textContent).toBe('Mature phrasing is on. 1 entry reworded. Your answers and your own wording are kept.');
    expect(screen.getByRole('radio', { name: 'Mature phrasing' }).checked).toBe(true);

    await user.click(screen.getByRole('radio', { name: 'General wording' }));
    expect(screen.queryByRole('alertdialog')).toBeNull(); // going back needs no note
    expect(screen.getByTestId('setting').textContent).toBe('false');
    expect(labels()).toEqual(['A general thing', 'Same either way']);
    expect(screen.getByTestId('said').textContent).toMatch(/^General wording is back\. 1 entry reworded\./);
  });

  it('adds a module in the wording the profile already uses', async () => {
    const user = await setup();
    await user.click(screen.getByRole('radio', { name: 'Mature phrasing' }));
    await user.click(screen.getByRole('button', { name: 'Turn on mature phrasing' }));
    await addAdult(user);
    expect(labels()).toEqual(['A direct thing', 'Same either way']);
  });

  it('has no serious accessibility problems in the panel or the note', async () => {
    const user = await setup();
    await user.click(screen.getByRole('radio', { name: 'Mature phrasing' }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
