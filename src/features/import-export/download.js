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
