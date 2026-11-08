// Hands a text file to the browser's download flow. Local only: the file is built in
// memory and offered as a download, and nothing is sent anywhere (I-06).

/**
 * @param {string} filename
 * @param {string} text
 * @param {string} [type]
 */
export function downloadTextFile(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hands a binary file (such as a picture) to the download flow. Local only, like the text version.
 * @param {string} filename
 * @param {Blob} blob
 */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
