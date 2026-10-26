import AxeBuilder from '@axe-core/playwright';
import { test, expect, HUG, stateButton, saved } from './fixtures.js';

// M3-07: what batch 3 added, driven through the production build. The fixture also fails any
// test that sends a request to another origin (I-06).
const card = (page, title) => page.locator('.module').filter({ has: page.getByRole('heading', { name: title }) });
const category = (page, name) => page.locator('.category-header h2', { hasText: name });
const dialog = (page) => page.getByRole('alertdialog');
const openLibrary = (page) => page.getByRole('button', { name: 'Open module library' }).click();

const RELATIONSHIP = 'Relationship and affection preferences';
const DAILY = 'Being in touch every day';
const NOTE = /intended for adults/;

test('an adult-intended module shows the note first and adds nothing until confirmed (D-009, D-036)', async ({ page }) => {
  await openLibrary(page);
  await expect(card(page, RELATIONSHIP)).toContainText('Intended for adults. Hidden until you turn it on.');

  await card(page, RELATIONSHIP).getByRole('button', { name: `Add ${RELATIONSHIP}` }).click();
  await expect(dialog(page)).toContainText(NOTE);
  await expect(dialog(page)).toContainText('does not ask for your age');
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(category(page, 'Closeness and time together')).toHaveCount(0);
  await expect(card(page, RELATIONSHIP)).toContainText('Not added');

  await card(page, RELATIONSHIP).getByRole('button', { name: `Add ${RELATIONSHIP}` }).click();
  await dialog(page).getByRole('button', { name: 'Turn on module' }).click();
  await expect(category(page, 'Closeness and time together')).toBeVisible();
  await expect(stateButton(page, DAILY)).toHaveText('Unanswered'); // nothing is answered for anyone (I-01)

  await stateButton(page, DAILY).click();
  await expect(stateButton(page, DAILY)).toHaveText('Unsure');

  // Hiding never needs the note, and it keeps the answer.
  await card(page, RELATIONSHIP).getByRole('button', { name: `Hide ${RELATIONSHIP}` }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(category(page, 'Closeness and time together')).toHaveCount(0);
  await saved(page);

  // Turning it on again asks again, and the answer is still there.
  await page.reload();
  await openLibrary(page);
  await card(page, RELATIONSHIP).getByRole('button', { name: `Turn on ${RELATIONSHIP}` }).click();
  await expect(dialog(page)).toContainText(NOTE);
  await dialog(page).getByRole('button', { name: 'Turn on module' }).click();
  await expect(stateButton(page, DAILY)).toHaveText('Unsure');
});

test('the emergency card is hidden by default but is not marked for adults (D-037)', async ({ page }) => {
  await openLibrary(page);
  const emergency = card(page, 'Emergency information card');
  await expect(emergency).not.toContainText('Intended for adults');
  await emergency.getByRole('button', { name: 'Add Emergency information card' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(category(page, 'People to contact')).toBeVisible();
});

test('reset puts wording back, keeps the answer, and is one undo step (D-038)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'long desktop flow; the panel itself is covered on the phone by modules.spec.js');
  await openLibrary(page);
  await card(page, 'Communication preferences').getByRole('button', { name: 'Add Communication preferences' }).click();
  const phone = 'A phone call';
  await stateButton(page, phone).click();
  await expect(stateButton(page, phone)).toHaveText('Unsure');

  await page.getByRole('button', { name: `Rename item ${phone}` }).click();
  await page.getByRole('textbox', { name: `New name for item ${phone}` }).fill('Ringing me up');
  await page.keyboard.press('Enter');
  await expect(stateButton(page, 'Ringing me up')).toHaveText('Unsure');

  await card(page, 'Communication preferences').getByRole('button', { name: /^Reset Communication preferences to template/ }).click();
  await expect(dialog(page)).toContainText('1 entry uses wording that differs from the template.');
  await dialog(page).getByRole('button', { name: 'Reset module' }).click();
  await expect(stateButton(page, phone)).toHaveText('Unsure');
  await expect(stateButton(page, 'Ringing me up')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(stateButton(page, 'Ringing me up')).toHaveText('Unsure');
});

test('start from modules makes a separate profile with only those modules (D-039, I-12)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'long desktop flow');
  await stateButton(page, HUG).click(); // an answer in the original profile
  await saved(page);

  await page.getByRole('button', { name: 'Open start from modules' }).click();
  const create = page.getByRole('button', { name: 'Create profile from modules' });
  await expect(create).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Communication preferences' }).check();
  await page.getByRole('checkbox', { name: /^Attraction/ }).check();
  await page.getByRole('textbox', { name: 'Name of the new profile' }).fill('Just two modules');
  await expect(page.getByText('2 modules chosen.')).toBeVisible();
  await create.click();

  await expect(dialog(page)).toContainText(NOTE); // one chosen module is for adults
  await dialog(page).getByRole('button', { name: 'Create profile' }).click();

  await expect(page.locator('.profile-name')).toHaveText('Profile: Just two modules');
  await expect(stateButton(page, HUG)).toHaveCount(0); // no sample items
  await expect(category(page, 'Ways of contacting me')).toBeVisible();
  await expect(stateButton(page, 'A phone call')).toHaveText('Unanswered');
  await saved(page);

  // The original profile is untouched.
  await page.getByLabel('Open a profile').selectOption({ label: 'My profile' });
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.profile-name')).toHaveText('Profile: My profile');
  await expect(stateButton(page, HUG)).toHaveText('Unsure');
});

test('start from modules needs no note when no module is for adults', async ({ page, isMobile }) => {
  test.skip(isMobile, 'long desktop flow');
  await page.getByRole('button', { name: 'Open start from modules' }).click();
  await page.getByRole('checkbox', { name: 'Sensory profile' }).check();
  await page.getByRole('textbox', { name: 'Name of the new profile' }).fill('Sensory only');
  await page.getByRole('button', { name: 'Create profile from modules' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.profile-name')).toHaveText('Profile: Sensory only');
  await expect(category(page, 'Sound')).toBeVisible();
});

test('the adult note and the new panels have no serious axe violations in any theme', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Open start from modules' }).click();
  await card(page, RELATIONSHIP).getByRole('button', { name: `Add ${RELATIONSHIP}` }).click();
  for (const theme of ['Light', 'Dark', 'High contrast']) {
    await page.getByRole('combobox', { name: 'Appearance' }).selectOption({ label: theme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, theme).toEqual([]);
  }
});

test('the adult note can be dismissed with Escape and nothing changes', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  await openLibrary(page);
  await card(page, RELATIONSHIP).getByRole('button', { name: `Add ${RELATIONSHIP}` }).click();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(card(page, RELATIONSHIP)).toContainText('Not added');
});
