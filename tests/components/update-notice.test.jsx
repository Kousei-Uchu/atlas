// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { UpdateNotice } from '../../src/app/UpdateNotice.jsx';
import { applyUpdate, registerShell, resetShellUpdatesForTests } from '../../src/app/shell-updates.js';

afterEach(resetShellUpdatesForTests);

function fakeNav({ controller = {}, waiting = null } = {}) {
  const listeners = {};
  const regListeners = {};
  const registration = {
    waiting, installing: null,
    addEventListener: (t, f) => { regListeners[t] = f; },
  };
  const nav = {
    serviceWorker: {
      controller,
      register: vi.fn(async () => registration),
      addEventListener: (t, f) => { listeners[t] = f; },
    },
  };
  return { nav, registration, regListeners, listeners };
}

describe('registerShell', () => {
  it('says so, and does nothing, when the browser has no service workers', async () => {
    expect(await registerShell({})).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('survives a refused registration', async () => {
    const nav = { serviceWorker: { register: async () => { throw new Error('private window'); } } };
    expect(await registerShell(nav)).toEqual({ ok: false, reason: 'refused' });
  });

  it('shows nothing on first install, because there is nothing to replace', async () => {
    const { nav, registration, regListeners } = fakeNav({ controller: null });
    render(<UpdateNotice />);
    await registerShell(nav);
    const worker = { state: 'installing', addEventListener: (t, f) => { worker.fire = f; }, postMessage: vi.fn() };
    registration.installing = worker;
    regListeners.updatefound();
    worker.state = 'installed'; await act(async () => worker.fire());
    expect(screen.queryByTestId('update-ready')).toBeNull();
  });
});

describe('the update notice', () => {
  it('appears when a newer version is waiting, and only reloads when asked', async () => {
    const waitingWorker = { postMessage: vi.fn() };
    const { nav, listeners } = fakeNav({ waiting: waitingWorker });
    render(<UpdateNotice />);
    expect(screen.queryByTestId('update-ready')).toBeNull();
    await act(async () => { await registerShell(nav); });
    expect(screen.getByTestId('update-ready').textContent).toContain('Your chart is saved');

    const reload = vi.fn();
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeTruthy();
    // The component uses the real reload; drive the same path directly to check the hand-off.
    applyUpdate(nav, reload);
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    listeners.controllerchange();
    expect(reload).toHaveBeenCalledOnce();
  });
});
