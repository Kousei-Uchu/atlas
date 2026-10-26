// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModulesPanel } from '../../src/features/modules/ModulesPanel.jsx';
import { NewProfileFromModules } from '../../src/features/modules/NewProfileFromModules.jsx';
import { createStarterProfile } from '../../src/domain/defaults.js';
import { validateTemplate } from '../../src/domain/templates.js';
import { addModule } from '../../src/domain/module-commands.js';
import { setItemState, renameItem } from '../../src/domain/commands.js';
import { ADULT_MODULE_NOTICE } from '../../src/content/notices.js';
import { freshDb, renderAtlas, seriousViolations } from './helpers.jsx';
import { listProfiles, loadProfile } from '../../src/storage/profile-repository.js';

vi.setConfig({ testTimeout: 60000 });
afterEach(cleanup);

const NOW = '2026-10-26T10:00:00.000Z';
const spec = (version) => ({
  templateId: 'mod-test', version, title: 'Test module', summary: 'For tests only.',
  defaultVisibility: 'visible', adultIntended: false, isSample: false, statement: 'preferences-not-consent',
  categories: [
    { key: 'a', name: 'Category A', sensitivity: 'normal', items: [{ key: 'a1', label: 'One' }, { key: 'a2', label: 'Two' }, ...(version >= 2 ? [{ key: 'a3', label: 'Three' }] : [])] },
    ...(version >= 2 ? [{ key: 'b', name: 'Category B', sensitivity: 'normal', items: [{ key: 'b1', label: 'Four' }] }] : []),
  ],
});
const v1 = validateTemplate(spec(1)).template;
const v2 = validateTemplate(spec(2)).template;
const adult = validateTemplate({
  templateId: 'adult-test', version: 1, title: 'Adult test module', summary: 'For tests only.',
  defaultVisibility: 'hidden', adultIntended: true, isSample: false, statement: 'preferences-not-consent',
  categories: [{ key: 'r', name: 'Restricted', sensitivity: 'restricted', items: [{ key: 'r1', label: 'Thing' }] }],
}).template;

const card = (title) => [...document.querySelectorAll('.module')].find((el) => el.querySelector('h3').textContent === title) ?? null;
const press = (user, title, name) => user.click(within(card(title)).getByRole('button', { name }));

function start() {
  let profile = createStarterProfile({ id: 'p1', now: NOW });
  profile = addModule(profile, { template: v1 }, NOW).profile;
  const a1 = profile.items.find((i) => i.origin?.key === 'a1');
  profile = setItemState(profile, { itemId: a1.id, stateId: 'yes' }, NOW).profile;
  profile = renameItem(profile, { id: profile.items.find((i) => i.origin?.key === 'a2').id, label: 'My own words' }, NOW).profile;
  return profile;
}

function Harness({ templates }) {
  const [profile, setProfile] = useState(start);
  const [said, setSaid] = useState('');
  const run = (command, args) => {
    const result = command(profile, args, NOW);
    if (result.ok) setProfile(result.profile);
    return result;
  };
  return (
    <>
      <ModulesPanel profile={profile} run={run} announce={setSaid} templates={templates} />
      <p data-testid="said">{said}</p>
      <p data-testid="labels">{profile.items.map((i) => i.label).join('|')}</p>
      <p data-testid="answers">{profile.answers.map((a) => `${a.itemId}:${a.stateId}`).join('|')}</p>
    </>
  );
}

async function setup(templates) {
  const user = userEvent.setup();
  render(<Harness templates={templates} />);
  await user.click(screen.getByRole('button', { name: 'Open module library' }));
  return user;
}

describe('updating a module (M3-06)', () => {
  it('says nothing about an update while the module matches its template', async () => {
    await setup([v1]);
    expect(within(card('Test module')).queryByText(/newer version/)).toBeNull();
    expect(within(card('Test module')).queryByRole('button', { name: /^Update/ })).toBeNull();
  });

  it('offers an update when the template is newer, and lists what it will add before doing it', async () => {
    const user = await setup([v2]);
    expect(within(card('Test module')).getByText('A newer version of this module is available (version 1 to 2).')).toBeTruthy();
    await press(user, 'Test module', 'Update Test module');
    const dialog = screen.getByRole('alertdialog', { name: 'Update Test module?' });
    expect(dialog.textContent).toMatch(/adds 2 items/);
    expect(dialog.textContent).toMatch(/Your answers, notes and wording are not changed/);
    expect(within(dialog).getByText('Three (in Category A)')).toBeTruthy();
    expect(within(dialog).getByText('Category B (new category, 1 item)')).toBeTruthy();
    // Nothing has changed yet, and Cancel is the focused choice.
    expect(screen.getByTestId('labels').textContent).not.toMatch(/Three/);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('cancelling changes nothing', async () => {
    const user = await setup([v2]);
    await press(user, 'Test module', 'Update Test module');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('labels').textContent).not.toMatch(/Three/);
  });

  it('adds the new items, keeps answers and the person\u2019s wording, announces it, and then offers no further update', async () => {
    const user = await setup([v2]);
    const answersBefore = screen.getByTestId('answers').textContent;
    await press(user, 'Test module', 'Update Test module');
    await user.click(screen.getByRole('button', { name: 'Update module' }));
    expect(screen.getByTestId('said').textContent).toBe('Updated Test module. 2 items added. Your answers are kept.');
    expect(screen.getByTestId('labels').textContent).toMatch(/Three/);
    expect(screen.getByTestId('labels').textContent).toMatch(/My own words/);
    expect(screen.getByTestId('answers').textContent).toBe(answersBefore);
    expect(within(card('Test module')).queryByRole('button', { name: /^Update/ })).toBeNull();
    expect(within(card('Test module')).queryByText(/newer version/)).toBeNull();
  });
});

describe('resetting a module (M3-06)', () => {
  it('says what it will do and how many entries differ, before it does anything', async () => {
    const user = await setup([v1]);
    await press(user, 'Test module', 'Reset Test module to template');
    const dialog = screen.getByRole('alertdialog', { name: 'Reset Test module to the template?' });
    expect(dialog.textContent).toMatch(/Your answers and notes are kept/);
    expect(dialog.textContent).toMatch(/Privacy levels are never lowered/);
    expect(dialog.textContent).toMatch(/1 entry uses wording that differs from the template\./);
    expect(within(dialog).getByText('My own words')).toBeTruthy();
    expect(screen.getByTestId('labels').textContent).toMatch(/My own words/);
  });

  it('puts the wording back, keeps the answer, and announces it', async () => {
    const user = await setup([v1]);
    const answersBefore = screen.getByTestId('answers').textContent;
    await press(user, 'Test module', 'Reset Test module to template');
    await user.click(screen.getByRole('button', { name: 'Reset module' }));
    expect(screen.getByTestId('said').textContent).toBe('Reset Test module. 1 entry restored and 0 items added. Your answers are kept.');
    expect(screen.getByTestId('labels').textContent).toMatch(/Two/);
    expect(screen.getByTestId('labels').textContent).not.toMatch(/My own words/);
    expect(screen.getByTestId('answers').textContent).toBe(answersBefore);
  });

  it('is offered only for modules that are in the profile', async () => {
    await setup([v1, adult]);
    expect(within(card('Test module')).getByRole('button', { name: 'Reset Test module to template' })).toBeTruthy();
    expect(within(card('Adult test module')).queryByRole('button', { name: /^Reset/ })).toBeNull();
    expect(within(card('Adult test module')).queryByRole('button', { name: /^Update/ })).toBeNull();
  });

  it('does not ask for the note again to reset an adult module that is already in the profile', async () => {
    const user = userEvent.setup();
    function AdultHarness() {
      const [profile, setProfile] = useState(() => addModule(createStarterProfile({ id: 'p1', now: NOW }), { template: adult, visibility: 'visible', acknowledgeAdult: true }, NOW).profile);
      const run = (command, args) => { const r = command(profile, args, NOW); if (r.ok) setProfile(r.profile); return r; };
      return <ModulesPanel profile={profile} run={run} announce={() => {}} templates={[adult]} />;
    }
    render(<AdultHarness />);
    await user.click(screen.getByRole('button', { name: 'Open module library' }));
    await press(user, 'Adult test module', 'Reset Adult test module to template');
    const dialog = screen.getByRole('alertdialog', { name: 'Reset Adult test module to the template?' });
    expect(dialog.textContent).not.toContain(ADULT_MODULE_NOTICE);
    await user.click(screen.getByRole('button', { name: 'Reset module' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('can be undone in the real editor, and the answer is there before and after', async () => {
    const db = await freshDb();
    try {
      const { user } = await renderAtlas(db);
      await user.click(screen.getByRole('button', { name: 'Open module library' }));
      await user.click(within(card('Communication preferences')).getByRole('button', { name: 'Add Communication preferences' }));
      await user.click(screen.getByRole('button', { name: /^A phone call:/ }));
      const answered = screen.getByRole('button', { name: /^A phone call:/ }).textContent;
      await user.click(within(card('Communication preferences')).getByRole('button', { name: 'Reset Communication preferences to template' }));
      await user.click(screen.getByRole('button', { name: 'Reset module' }));
      await waitFor(() => expect(document.querySelector('[role="status"][aria-live="polite"]').textContent).toMatch(/^Reset Communication preferences\./));
      expect(screen.getByRole('button', { name: /^A phone call:/ }).textContent).toBe(answered);
      await user.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('button', { name: /^A phone call:/ }).textContent).toBe(answered);
    } finally {
      db.close();
    }
  });
});

describe('starting a profile from modules (M3-06)', () => {
  const templates = [v1, adult];
  const renderForm = (onCreate = vi.fn().mockResolvedValue(true), announce = vi.fn()) => {
    render(<NewProfileFromModules onCreate={onCreate} announce={announce} templates={templates} />);
    return { onCreate, announce, user: userEvent.setup() };
  };

  it('is closed at first, and its create button waits for a name and a module', async () => {
    const { user } = renderForm();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Open/ }));
    const create = screen.getByRole('button', { name: 'Create profile from modules' });
    expect(create.disabled).toBe(true);
    expect(screen.getByText('No modules chosen yet.')).toBeTruthy();
    await user.type(screen.getByLabelText('Name of the new profile'), 'School');
    expect(create.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Test module' }));
    expect(create.disabled).toBe(false);
    expect(screen.getByText('1 module chosen.')).toBeTruthy();
  });

  it('creates the profile from the chosen modules in the order they were ticked, without a note when none is for adults', async () => {
    const { user, onCreate, announce } = renderForm();
    await user.click(screen.getByRole('button', { name: /^Open/ }));
    await user.type(screen.getByLabelText('Name of the new profile'), 'School');
    await user.click(screen.getByRole('checkbox', { name: 'Test module' }));
    await user.click(screen.getByRole('button', { name: 'Create profile from modules' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onCreate).toHaveBeenCalledWith({ title: 'School', templates: [v1], acknowledgeAdult: false });
    await waitFor(() => expect(announce).toHaveBeenCalledWith('New profile created from your modules'));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shows the note first when a module for adults is chosen, and creates nothing if cancelled', async () => {
    const { user, onCreate } = renderForm();
    await user.click(screen.getByRole('button', { name: /^Open/ }));
    await user.type(screen.getByLabelText('Name of the new profile'), 'Private');
    await user.click(screen.getByRole('checkbox', { name: /Adult test module/ }));
    await user.click(screen.getByRole('button', { name: 'Create profile from modules' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain(ADULT_MODULE_NOTICE);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Create profile from modules' }));
    await user.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(onCreate).toHaveBeenCalledWith({ title: 'Private', templates: [adult], acknowledgeAdult: true });
  });

  it('keeps what was typed when the profile could not be created', async () => {
    const { user, announce } = renderForm(vi.fn().mockResolvedValue(false));
    await user.click(screen.getByRole('button', { name: /^Open/ }));
    await user.type(screen.getByLabelText('Name of the new profile'), 'Keep me');
    await user.click(screen.getByRole('checkbox', { name: 'Test module' }));
    await user.click(screen.getByRole('button', { name: 'Create profile from modules' }));
    expect(announce).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name of the new profile').value).toBe('Keep me');
    expect(screen.getByRole('checkbox', { name: 'Test module' }).checked).toBe(true);
  });

  it('has no serious accessibility problems when open', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: /^Open/ }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});

describe('in the real editor (M3-06)', () => {
  let db;
  beforeEach(async () => { db = await freshDb(); });
  afterEach(() => db.close());

  it('creates a separate, saved profile that has only the chosen module and no sample items or answers', async () => {
    const { user } = await renderAtlas(db);
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    const original = (await listProfiles(db))[0].id;
    await user.click(screen.getByRole('button', { name: /^Open\s*start from modules/ }));
    await user.type(screen.getByLabelText('Name of the new profile'), 'Just communication');
    await user.click(screen.getByRole('checkbox', { name: 'Communication preferences' }));
    await user.click(screen.getByRole('button', { name: 'Create profile from modules' }));
    await waitFor(() => expect(screen.getByText('Profile: Just communication')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    const all = await listProfiles(db);
    expect(all.length).toBe(2);
    const created = all.find((p) => p.id !== original);
    const { profile } = await loadProfile(db, created.id);
    expect(profile.metadata.templateIds).toEqual(['communication']);
    expect(profile.categories.some((c) => c.name.startsWith('Sample'))).toBe(false);
    expect(profile.answers).toEqual([]);
    // The first profile is untouched.
    const first = (await loadProfile(db, original)).profile;
    expect(first.metadata.templateIds).toEqual(['starter']);
  });
});
