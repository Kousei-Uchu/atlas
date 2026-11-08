// Size guidance for a share link (spec 11.5; R-11; M5-03). The whole link is measured, not just the
// payload, because that is what a messaging app has to carry. Links are plain ASCII, so characters are bytes.
const KB = 1024;

export const SIZE_BANDS = Object.freeze(['target', 'reasonable', 'warning', 'strong', 'file']);

/**
 * @param {number} bytes  Length of the full link.
 * @returns {{ band: string, label: string, text: string, offerFile: boolean, preferFile: boolean }}
 */
export function sizeAdvice(bytes) {
  if (bytes < 2 * KB) return { band: 'target', label: 'Short', text: 'Short enough to paste almost anywhere.', offerFile: false, preferFile: false };
  if (bytes < 8 * KB) return { band: 'reasonable', label: 'Reasonable', text: 'A normal size for a link.', offerFile: false, preferFile: false };
  if (bytes < 32 * KB) {
    return { band: 'warning', label: 'Long', text: 'Some apps cut long links short. Open the link after you send it, to check it still works.', offerFile: false, preferFile: false };
  }
  if (bytes < 100 * KB) {
    return { band: 'strong', label: 'Very long', text: 'Long links often break in messaging apps. A file is safer to share.', offerFile: true, preferFile: false };
  }
  return { band: 'file', label: 'Too long for a link', text: 'This is too long to share reliably as a link. Share a file instead.', offerFile: true, preferFile: true };
}

/** "1.4 KB", "312 bytes". */
export function formatSize(bytes) {
  return bytes < KB ? `${bytes} bytes` : `${(bytes / KB).toFixed(bytes < 10 * KB ? 1 : 0)} KB`;
}

/**
 * The longest link offered as a QR code. Past this the code gets too dense to scan reliably from a
 * screen, so a file is the better way to share (spec 11.5; R-11).
 */
export const QR_MAX_LINK_BYTES = 800;
