// Make a share link from a view (spec 11; I-07, I-11; M5-03).
//
// The link is built from the same export model as every download, so it holds only what the review
// showed. The fixed privacy note is on screen before a link exists and stays with it. The whole link
// is measured, with plain advice by size, and a file is offered where links get unreliable (R-11).
// The link is made on request and is dropped if the view changes, so it can never be out of date.
import { useId, useState } from 'react';
import { buildExportModel } from '../../domain/export-model.js';
import { buildEnvelope } from '../../share/envelope.js';
import { encodePayload } from '../../share/codec.js';
import { buildShareUrl } from '../../share/fragment.js';
import { formatSize, QR_MAX_LINK_BYTES, sizeAdvice } from '../../share/size.js';
import { QrCode } from './QrCode.jsx';
import { SHARE_PRIVACY_NOTICE } from '../../content/notices.js';

const REFUSED = 'The link could not be made. Use a file instead.';

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

/**
 * @param {{
 *   profile: object, view: object, ready: boolean, now: () => string, announce: (text: string) => void,
 *   onDownloadFile: () => void, pageUrl?: string, copyText?: (text: string) => Promise<void>,
 * }} props
 */
export function ShareLink({ profile, view, ready, now, announce, onDownloadFile, pageUrl = window.location.href, copyText = copyToClipboard }) {
  const id = useId();
  const [made, setMade] = useState(null); // { url, bytes, advice, from }
  const [error, setError] = useState('');
  const [showAnyway, setShowAnyway] = useState(false);
  const [copyNote, setCopyNote] = useState('');
  const [qr, setQr] = useState(false);

  // What the link would hold right now. A link made from anything else is out of date.
  const current = ready ? buildExportModel(profile, view, { generatedAt: now() }) : null;
  const fingerprint = current?.ok ? JSON.stringify({ ...current.model, date: '' }) : null;
  const fresh = made !== null && fingerprint !== null && made.from === fingerprint;
  const stale = made !== null && !fresh;

  const make = async () => {
    setError('');
    setCopyNote('');
    setShowAnyway(false);
    setQr(false);
    if (!current?.ok) { setError(current?.error ?? REFUSED); return; }
    const built = buildEnvelope(current.model, { createdAt: now() });
    if (!built.ok) { setError(REFUSED); return; }
    const encoded = await encodePayload(built.envelope);
    if (!encoded.ok) { setMade(null); setError(`${encoded.error.message} Use a file instead.`); return; }
    const url = buildShareUrl(pageUrl, encoded.payload);
    setMade({ url, bytes: url.length, advice: sizeAdvice(url.length), from: fingerprint });
    announce('Link made');
  };

  const copy = async () => {
    try {
      await copyText(made.url);
      setCopyNote('Link copied.');
      announce('Link copied');
    } catch {
      setCopyNote('The link could not be copied automatically. Select it in the box and copy it yourself.');
    }
  };

  const advice = fresh ? made.advice : null;
  const hideCopy = advice?.preferFile && !showAnyway;

  return (
    <section className="panel-block share-link" aria-label="Share as a link">
      <h4>Share as a link</h4>
      <p className="banner" data-tone="caution" data-testid="share-privacy">{SHARE_PRIVACY_NOTICE}</p>
      <p className="hint">The link holds exactly what the review shows and this chart&apos;s consent statement. It does not hold your other items, your audiences or your profile name.</p>
      <div className="panel-actions">
        <button type="button" disabled={!ready} onClick={make}>{made ? 'Make the link again' : 'Make a link'}</button>
      </div>
      {!ready && <p className="hint">Pick at least one item that can be included to make a link.</p>}
      {error && <p className="banner" role="alert" data-tone="error">{error}</p>}
      {stale && <p className="banner" role="status" data-tone="caution">The view has changed since this link was made, so the link was removed. Make it again.</p>}

      {fresh && (
        <div data-testid="share-result" data-band={advice.band}>
          <p>
            <label htmlFor={`${id}-size`}>Link size: {formatSize(made.bytes)}. {advice.label}.</label>{' '}
            <meter id={`${id}-size`} min={0} max={100 * 1024} low={8 * 1024} high={32 * 1024} optimum={0} value={Math.min(made.bytes, 100 * 1024)} aria-valuetext={`${formatSize(made.bytes)}, ${advice.label}`} />
          </p>
          <p data-testid="share-advice" role={advice.band === 'warning' || advice.offerFile ? 'status' : undefined}>{advice.text}</p>
          {advice.offerFile && (
            <p className="panel-actions"><button type="button" onClick={onDownloadFile}>Download a Markdown file instead</button></p>
          )}
          {hideCopy ? (
            <p className="panel-actions"><button type="button" onClick={() => setShowAnyway(true)}>Show the link anyway</button></p>
          ) : (
            <>
              <label htmlFor={`${id}-url`}>Share link</label>
              <textarea id={`${id}-url`} className="export-preview" readOnly rows={4} value={made.url} onFocus={(e) => e.target.select()} />
              <p className="panel-actions"><button type="button" onClick={copy}>Copy link</button></p>
              {copyNote && <p role="status">{copyNote}</p>}
              {made.bytes <= QR_MAX_LINK_BYTES ? (
                <>
                  <p className="panel-actions">
                    <button type="button" aria-expanded={qr} aria-controls={`${id}-qr`} onClick={() => setQr((v) => !v)}>{qr ? 'Hide QR code' : 'Show QR code'}</button>
                  </p>
                  {qr && (
                    <div id={`${id}-qr`} data-testid="share-qr">
                      <QrCode text={made.url} label="QR code for the share link. Scanning it opens the same chart." />
                      <p className="hint">Anyone who scans this code can open and read the chart, the same as the link.</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="hint" data-testid="share-no-qr">This link is too long for a QR code that scans well. A file is the better way to share it.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
