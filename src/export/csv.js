import { stripControl } from './clean.js';

// CSV export (M8-01, D-068). Renders the export model and nothing else, so whatever a view holds back
// is not in the file (R-05). It follows RFC 4180: every cell is quoted, a quote is doubled, rows end with
// CRLF. The file starts with a byte-order mark so spreadsheet programs read non-English text correctly.
//
// A spreadsheet runs a cell that starts with = + - @ (or a tab or carriage return) as a formula, and a
// label or note is the person's own text. So such a cell gets a leading apostrophe, which spreadsheets
// show as plain text. The apostrophe is added to the text and never to the person's data.

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const FORMULA_START = /^\s*[=+\-@]|^[\t\r]/;

/** One cell, made safe for a spreadsheet and quoted. */
export function csvCell(value) {
  let text = stripControl(value ?? '').replace(/\r\n?/g, '\n');
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const row = (cells) => cells.map(csvCell).join(',');

/** @param {ReturnType<import('../domain/export-model.js').buildExportModel>['model']} model */
export function renderCsv(model) {
  const lines = [];
  lines.push(row([model.title]));
  lines.push(row(['For', model.audience === null ? 'Everyone (my own answers)' : model.audience]));
  lines.push(row(['Prepared on', model.date]));
  lines.push(row([model.statement]));
  lines.push('');
  const hasNotes = model.sections.some((s) => s.items.some((i) => i.note));
  lines.push(row(hasNotes ? ['Group', 'Item', 'Answer', 'Note'] : ['Group', 'Item', 'Answer']));
  for (const section of model.sections) {
    for (const item of section.items) {
      const answer = item.kind === 'state' ? item.state.label : (item.text.trim() === '' ? '(nothing written)' : item.text.trim());
      const cells = [section.name, item.label, answer];
      if (hasNotes) cells.push(item.note ?? '');
      lines.push(row(cells));
    }
  }
  lines.push('');
  lines.push(row(['How to read this']));
  lines.push(row(['State', 'Meaning']));
  for (const s of model.legend) lines.push(row([s.label, s.description ?? '']));
  lines.push('');
  lines.push(row([model.statement]));
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}
