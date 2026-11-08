// The read-only preview of a shared chart (D-016, I-07, I-08; M5-02).
//
// It replaces the app while a share link is open. It reads the link, shows what is in it as plain
// text, and offers to save a copy. It does not open storage until the person confirms, so a link
// can never touch the profiles already here, and nothing is merged or overwritten (I-12).
// Everything shown came from untrusted data, so it is only ever rendered as text.
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { StateBadge } from '../../components/StateBadge.jsx';
import { DECODE_ERRORS, decodePayload } from '../../share/codec.js';
import { isSupportedVersion } from '../../share/fragment.js';
import { profileFromEnvelope } from '../../share/envelope-to-profile.js';
import { newId } from '../../domain/ids.js';

export const PREVIEW_NOTICE = 'You are looking at a shared chart. It is read-only and it has not been saved. Your own profiles have not been changed.';

/**
 * @param {{
 *   fragment: { kind: 'share', version: string, payload: string } | { kind: 'broken' },
 *   onSaveCopy: (profile: object) => Promise<void>,
 *   onLeave: () => void,
 *   now?: () => string,
 *   decode?: typeof decodePayload,
 * }} props
 */
export function SharedChartPage({ fragment, onSaveCopy, onLeave, now = () => new Date().toISOString(), decode = decodePayload }) {
  const [state, setState] = useState({ phase: 'reading' });
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const headingRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (fragment.kind === 'broken') { setState({ phase: 'failed', message: DECODE_ERRORS['bad-encoding'] }); return; }
      if (!isSupportedVersion(fragment.version)) { setState({ phase: 'failed', message: DECODE_ERRORS.unsupported }); return; }
      const result = await decode(fragment.payload);
      if (cancelled) return;
      setState(result.ok ? { phase: 'ready', envelope: result.envelope } : { phase: 'failed', message: result.error.message });
    })();
    return () => { cancelled = true; };
  }, [fragment, decode]);

  useEffect(() => { if (state.phase !== 'reading') headingRef.current?.focus(); }, [state.phase]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const built = profileFromEnvelope(state.envelope, { id: newId('profile'), now: now() });
      if (!built.ok) throw new Error(built.error);
      await onSaveCopy(built.profile);
    } catch {
      setSaveError('The copy could not be saved. Nothing was changed. Private browsing modes and some strict privacy settings stop this browser from saving.');
      setSaving(false);
      setAsking(false);
    }
  };

  return (
    <main className="app-main shared-chart">
      <h1>Personal Boundaries &amp; Identity Atlas</h1>

      {state.phase === 'reading' && <p role="status">Reading the link…</p>}

      {state.phase === 'failed' && (
        <>
          <h2 ref={headingRef} tabIndex={-1}>This link could not be opened</h2>
          <p role="alert">{state.message}</p>
          <p>Nothing was saved and your own profiles have not been changed. If you were sent this link, ask for it again or for a file instead.</p>
          <p><button type="button" onClick={onLeave}>Open my own charts</button></p>
        </>
      )}

      {state.phase === 'ready' && (
        <>
          <p className="banner" data-tone="info">{PREVIEW_NOTICE}</p>
          <h2 ref={headingRef} tabIndex={-1}>{state.envelope.title}</h2>
          <p className="hint">Shared {state.envelope.createdAt.slice(0, 10)}{state.envelope.includesNotes ? ', with notes' : ''}</p>
          <section className="notice" data-tone="info" aria-label="Preferences are not consent">
            <h3 className="notice-title">Preferences are not consent</h3>
            <p className="notice-text">{state.envelope.statement}</p>
          </section>

          <div className="panel-actions print-hide">
            <button type="button" onClick={() => setAsking(true)} disabled={saving}>Save a copy</button>
            <button type="button" onClick={onLeave}>Leave without saving</button>
            <button type="button" onClick={() => window.print()}>Print</button>
          </div>
          {saveError && <p role="alert">{saveError}</p>}

          {state.envelope.groups.map((group, g) => (
            <section key={g} className="shared-group" aria-label={group.name}>
              <h3>{group.name}</h3>
              <ul className="shared-items">
                {group.items.map((item, i) => (
                  <li key={i}>
                    <span className="shared-label">{item.label}</span>{' '}
                    {item.kind === 'state' ? <StateBadge state={state.envelope.states[item.state]} /> : <span className="shared-text">{item.text === '' ? 'Nothing written' : item.text}</span>}
                    {item.note && <p className="shared-note"><strong>Note:</strong> {item.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {asking && (
            <ConfirmDialog
              title="Save a copy of this chart?"
              description="This adds one new profile to this browser, with these answers in it. Your existing profiles are not changed and nothing is merged. The copy stays on this device."
              confirmLabel="Save a copy"
              onConfirm={save}
              onCancel={() => setAsking(false)}
            />
          )}
        </>
      )}
    </main>
  );
}
