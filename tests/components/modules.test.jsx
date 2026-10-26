// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDb, renderAtlas, seriousViolations, stateButton } from './helpers.jsx';
import { ModulesPanel } from '../../src/features/modules/ModulesPanel.jsx';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateTemplate } from '../../src/domain/templates.js';
import { ADULT_MODULE_NOTICE } from '../../src/content/notices.js';
import { TEMPLATES } from '../../src/content/templates/index.js';
import { loadProfile, listProfiles } from '../../src/storage/profile-repository.js';

// Adding a module renders dozens of rows, which is slow in jsdom.
vi.setConfig({ testTimeout: 60000 });

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(() => db.close());

const liveText = () => document.querySelector('[role="status"][aria-live="polite"]').textContent.trim();
const open = (user) => user.click(screen.getByRole('button', { name: 'Open module library' }));
// Role queries with a name scan the whole page, which is slow with hundreds of rows in jsdom.
// These look inside the module card, or read the category headings straight from the page.
const moduleCard = (title) => [...document.querySelectorAll('.module')].find((el) => el.querySelector('h3').textContent === title) ?? null;
const hasCategory = (name) => [...document.querySelectorAll('.category-header h2')].some((h) => h.textContent === name);
const press = (user, title, verb) => user.click(within(moduleCard(title)).getByRole('button', { name: `${verb} ${title}` }));

async function stored() {
  await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  const [summary] = await listProfiles(db);
  return (await loadProfile(db, summary.id)).profile;
}

describe('module library (M3-04)', () => {
  it('is closed at first and lists every template except the sample', async () => {
    const { user } = await renderAtlas(db);
    expect(document.querySelector('.module-list')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Open module library' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await open(user);
    expect(screen.getByRole('button', { name: 'Close module library' }).getAttribute('aria-expanded')).toBe('true');
    const expected = TEMPLATES.filter((t) => !t.isSample).map((t) => t.title);
    for (const title of expected) expect(moduleCard(title)).toBeTruthy();
    expect(moduleCard('Starter checklist')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close module library' }));
    expect(document.querySelector('.module-list')).toBeNull();
  });

  it('adds a module to the chart with every item Unanswered, and announces it', async () => {
    const { user } = await renderAtlas(db);
    await open(user);
    expect(hasCategory('Ways of contacting me')).toBe(false);
    await press(user, 'Communication preferences', 'Add');
    expect(liveText()).toBe('Added Communication preferences');
    expect(hasCategory('Ways of contacting me')).toBe(true);
    expect(stateButton('A phone call').textContent).toBe('Unanswered');
    const card = within(moduleCard('Communication preferences'));
    expect(card.getByText(/^On\./)).toBeTruthy();
    expect(card.queryByRole('button', { name: 'Add Communication preferences' })).toBeNull();
    expect(card.getByRole('button', { name: 'Hide Communication preferences' })).toBeTruthy();
    const profile = await stored();
    expect(profile.metadata.templateIds).toContain('communication');
    expect(profile.answers).toEqual([]);
  });

  it('hides a module without losing answers, and turns it on again', async () => {
    const { user } = await renderAtlas(db);
    await open(user);
    await press(user, 'Communication preferences', 'Add');
    await user.click(stateButton('A phone call')); // Unanswered -> Unsure
    expect(stateButton('A phone call').textContent).toBe('Unsure');

    await press(user, 'Communication preferences', 'Hide');
    expect(liveText()).toBe('Hid Communication preferences. Your answers are kept.');
    expect(hasCategory('Ways of contacting me')).toBe(false);
    expect(within(moduleCard('Communication preferences')).getByText('Hidden. Your answers are kept.')).toBeTruthy();

    await press(user, 'Communication preferences', 'Turn on');
    expect(liveText()).toBe('Turned on Communication preferences');
    expect(stateButton('A phone call').textContent).toBe('Unsure');
  });

  it('can be undone and redone', async () => {
    const { user } = await renderAtlas(db);
    await open(user);
    await press(user, 'Communication preferences', 'Add');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(hasCategory('Ways of contacting me')).toBe(false);
    expect(within(moduleCard('Communication preferences')).getByRole('button', { name: 'Add Communication preferences' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(hasCategory('Ways of contacting me')).toBe(true);
  });

  it('keeps the module after a reload, including whether it is hidden', async () => {
    const first = await renderAtlas(db);
    await open(first.user);
    await press(first.user, 'Communication preferences', 'Add');
    await press(first.user, 'Sensory profile', 'Add');
    await press(first.user, 'Sensory profile', 'Hide');
    await stored();
    first.unmount();

    const second = await renderAtlas(db);
    expect(hasCategory('Ways of contacting me')).toBe(true);
    expect(hasCategory('Sound')).toBe(false);
    await open(second.user);
    expect(within(moduleCard('Sensory profile')).getByRole('button', { name: 'Turn on Sensory profile' })).toBeTruthy();
  });

  it('can add several modules, and each can be handled on its own', async () => {
    const { user } = await renderAtlas(db);
    await open(user);
    await press(user, 'Communication preferences', 'Add');
    await press(user, 'Personal space and proximity', 'Add');
    await press(user, 'Communication preferences', 'Hide');
    expect(hasCategory('Ways of contacting me')).toBe(false);
    expect(hasCategory('How close people are')).toBe(true);
  });

  it('shows the starter sample untouched when modules are hidden', async () => {
    const { user } = await renderAtlas(db);
    await open(user);
    await press(user, 'Communication preferences', 'Add');
    await press(user, 'Communication preferences', 'Hide');
    expect(stateButton('A hug from a friend')).toBeTruthy();
  });

  it('has no serious or critical axe violations with the library open', async () => {
    const { user, container } = await renderAtlas(db);
    await open(user);
    await press(user, 'Communication preferences', 'Add');
    expect(await seriousViolations(container)).toEqual([]);
  });
});

// These tests use made-up templates, so the note and the panel are tested
// against a small made-up one through the panel on its own.
const NOW = '2026-10-26T10:00:00.000Z';
const adultTemplate = validateTemplate({
  templateId: 'adult-test', version: 1, title: 'Adult test module', summary: 'For tests only.',
  defaultVisibility: 'hidden', adultIntended: true, isSample: false, statement: 'preferences-not-consent',
  categories: [{ key: 'r', name: 'Restricted things', sensitivity: 'restricted', items: [{ key: 'r1', label: 'A restricted thing' }] }],
}).template;
const plainTemplate = validateTemplate({
  templateId: 'plain-test', version: 1, title: 'Plain test module', summary: 'For tests only.',
  defaultVisibility: 'visible', adultIntended: false, isSample: false, statement: 'preferences-not-consent',
  categories: [{ key: 'p', name: 'Plain things', sensitivity: 'normal', items: [{ key: 'p1', label: 'A plain thing' }] }],
}).template;

function Harness() {
  const [profile, setProfile] = useState(() => createStarterProfile({ id: 'p1', now: NOW }));
  const [said, setSaid] = useState('');
  const run = (command, args) => {
    const result = command(profile, args, NOW);
    if (result.ok) setProfile(result.profile);
    return result;
  };
  const shown = profile.categories.filter((c) => c.visibility === 'visible').map((c) => c.name);
  return (
    <>
      <ModulesPanel profile={profile} run={run} announce={setSaid} templates={[adultTemplate, plainTemplate]} />
      <p data-testid="ack">{String(profile.settings.restrictedModulesAcknowledged)}</p>
      <p data-testid="said">{said}</p>
      <ul data-testid="shown">{shown.map((n) => <li key={n}>{n}</li>)}</ul>
    </>
  );
}

describe('adult-intended modules (M3-04, D-009)', () => {
  const setup = async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    return user;
  };
  const shownNames = () => within(screen.getByTestId('shown')).queryAllByRole('listitem').map((li) => li.textContent);

  it('says the module is for adults before anything is added', async () => {
    await setup();
    expect(within(moduleCard('Adult test module')).getByText('Intended for adults. Hidden until you turn it on.')).toBeTruthy();
    expect(within(moduleCard('Plain test module')).queryByText(/Intended for adults/)).toBeNull();
  });

  it('shows the note first, and adds nothing if the person cancels', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add Adult test module' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Turn on Adult test module?' });
    expect(within(dialog).getByText(ADULT_MODULE_NOTICE)).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(shownNames()).not.toContain('Restricted things');
    expect(screen.getByRole('button', { name: 'Add Adult test module' })).toBeTruthy();
    expect(screen.getByTestId('ack').textContent).toBe('false');
  });

  it('cancels with Escape too', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add Adult test module' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(shownNames()).not.toContain('Restricted things');
  });

  it('adds and shows the module once the note is accepted, with no age recorded', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add Adult test module' }));
    await user.click(screen.getByRole('button', { name: 'Turn on module' }));
    expect(shownNames()).toContain('Restricted things');
    expect(screen.getByTestId('said').textContent).toBe('Added Adult test module');
    expect(screen.getByTestId('ack').textContent).toBe('true');
    expect(within(moduleCard('Adult test module')).getByText(/^On\./)).toBeTruthy();
  });

  it('can be hidden with no note, and shows the note again to turn it back on', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add Adult test module' }));
    await user.click(screen.getByRole('button', { name: 'Turn on module' }));

    await user.click(screen.getByRole('button', { name: 'Hide Adult test module' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(shownNames()).not.toContain('Restricted things');

    await user.click(screen.getByRole('button', { name: 'Turn on Adult test module' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(shownNames()).not.toContain('Restricted things');
    await user.click(screen.getByRole('button', { name: 'Turn on module' }));
    expect(shownNames()).toContain('Restricted things');
    expect(screen.getByTestId('said').textContent).toBe('Turned on Adult test module');
  });

  it('does not show the note for an ordinary module', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add Plain test module' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(shownNames()).toContain('Plain things');
    expect(screen.getByTestId('ack').textContent).toBe('false');
  });

  it('has no serious or critical axe violations with the note open', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Add Adult test module' }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
