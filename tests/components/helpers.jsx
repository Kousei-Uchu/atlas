// Shared helpers for component tests. Importing this file also registers DOM cleanup.
import 'fake-indexeddb/auto';
import { afterEach, expect } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Atlas } from '../../src/app/App.jsx';
import { openAtlasDb } from '../../src/storage/database.js';

afterEach(cleanup);

let counter = 0;

/** Open a brand-new database, so every test starts from nothing. */
export function freshDb() {
  counter += 1;
  return openAtlasDb({ name: `atlas-ui-test-${counter}-${Math.random().toString(36).slice(2)}` });
}

/** Render the editor against a database and wait until the chart is on screen. */
export async function renderAtlas(db, props = {}) {
  const user = userEvent.setup();
  const view = render(<Atlas db={db} debounceMs={0} {...props} />);
  await screen.findByRole('heading', { level: 1 });
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  return { user, ...view };
}

/** The state button for an item, found by its accessible name. */
export const stateButton = (itemLabel) => screen.getByRole('button', { name: new RegExp(`^${itemLabel}:`) });

/**
 * Run axe on a container and return serious or critical violations.
 * Colour contrast needs real layout, which jsdom lacks, so it is checked separately.
 */
export async function seriousViolations(container) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}
