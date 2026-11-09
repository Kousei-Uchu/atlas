import { applyUpdate, useUpdateReady } from './shell-updates.js';

/** Shown only when a newer version of the app is ready. It never reloads by itself. */
export function UpdateNotice() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <p className="banner" role="status" data-tone="caution" data-testid="update-ready">
      A newer version of the Atlas is ready. Your chart is saved. Reload when you are at a good stopping point.{' '}
      <button type="button" onClick={() => applyUpdate()}>Reload now</button>
    </p>
  );
}
