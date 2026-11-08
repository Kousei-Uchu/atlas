// A safe file name for an export: plain letters, digits and hyphens, never the person's raw text.
export function exportFilename(viewName, date, extension) {
  const slug = String(viewName).normalize('NFKD').replace(/[^\x20-\x7E]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'undated';
  return `atlas-${slug || 'view'}-${day}.${extension}`;
}
