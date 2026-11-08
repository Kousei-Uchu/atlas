// A QR code for text, drawn locally as one SVG path (M5-04). Always black on white with a quiet
// zone, whatever the theme, because scanners need that contrast. Never a link or an image to fetch.
import { encodeQr, qrPath } from '../../share/qr.js';

const QUIET = 4;

/** @param {{ text: string, label: string, pixels?: number }} props */
export function QrCode({ text, label, pixels = 280 }) {
  const qr = encodeQr(text, { ecc: 'M' });
  if (!qr.ok) return <p role="alert">A QR code could not be made for this link. Use a file instead.</p>;
  const side = qr.size + QUIET * 2;
  return (
    <svg className="qr-code" role="img" aria-label={label} viewBox={`0 0 ${side} ${side}`} width={pixels} height={pixels} shapeRendering="crispEdges" data-version={qr.version}>
      <rect width={side} height={side} fill="#ffffff" />
      <path d={qrPath(qr.modules, QUIET)} fill="#000000" />
    </svg>
  );
}
