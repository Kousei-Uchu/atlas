import { stripControl } from './clean.js';

// Markdown export (M4-06). Renders the export model and nothing else.
// Everything a person typed is escaped, so a label or note can never become a link, a heading, a
// table or raw HTML in whatever reads the file.

/** Escape characters that Markdown or HTML would treat as markup. */
export function mdEscape(text) {
  return stripControl(text)
    .replace(/[\\`*_{}[\]<>|#~&]/g, (c) => (c === '&' ? '&amp;' : `\\${c}`))
    // A line that starts like a list, a quote or a heading would become one.
    .replace(/^(\s*)([-+]|\d+[.)])(\s)/gm, '$1\\$2$3');
}

const oneLine = (text) => mdEscape(String(text).replace(/\s+/g, ' ').trim());

/** A multi-line piece of text as a quote, one `>` per line. */
function quote(text, indent = '') {
  return String(text).split(/\r?\n/).map((line) => `${indent}> ${mdEscape(line)}`.trimEnd()).join('\n');
}

/** @param {ReturnType<import('../domain/export-model.js').buildExportModel>['model']} model */
export function renderMarkdown(model) {
  const out = [];
  out.push(`# ${oneLine(model.title)}`, '');
  out.push(`For: ${model.audience === null ? 'Everyone (my own answers)' : oneLine(model.audience)}`, '');
  out.push(`Prepared on ${model.date}`, '');
  out.push(quote(model.statement), '');

  out.push('## How to read this', '');
  for (const s of model.legend) {
    out.push(`- **${oneLine(s.label)}**${s.description ? `: ${oneLine(s.description)}` : ''}`);
  }
  out.push('');

  for (const section of model.sections) {
    out.push(`## ${oneLine(section.name)}`, '');
    for (const item of section.items) {
      if (item.kind === 'state') out.push(`- ${oneLine(item.label)}: **${oneLine(item.state.label)}**`);
      else {
        out.push(`- ${oneLine(item.label)}:`);
        out.push(item.text.trim() === '' ? '  > (nothing written)' : quote(item.text, '  '));
      }
      if (item.note) { out.push('  >'); out.push(quote(`Note: ${item.note}`, '  ')); }
    }
    out.push('');
  }
  out.push('---', '', quote(model.statement), '');
  return `${out.join('\n').trimEnd()}\n`;
}
