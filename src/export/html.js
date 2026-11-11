import { xmlEscape } from './svg.js';

// Standalone web page export (M8-03, D-070). One .html file a person can open in any browser, keep, or send.
// It renders the export model and nothing else (R-05), so it holds exactly what the other formats hold.
//
// The page has no script, no image, no font, no link and no form, and its own Content-Security-Policy
// forbids all of them, so it cannot run code or make a request however it is opened. All text is escaped.
// State names are text, never colour alone (I-09). It follows the reader's light or dark setting and prints
// cleanly. The consent statement is at the top and the bottom (I-02).

const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const STYLE = `
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1a1a1a; --line: #767676; }
@media (prefers-color-scheme: dark) { :root { --bg: #161616; --fg: #f2f2f2; --line: #9a9a9a; } }
body { margin: 0; padding: 1rem; background: var(--bg); color: var(--fg); font: 1rem/1.5 system-ui, sans-serif; }
main { max-width: 42rem; margin: 0 auto; }
h1 { font-size: 1.6rem; margin: 0 0 0.5rem; }
h2 { font-size: 1.2rem; margin: 1.5rem 0 0.25rem; }
.statement { border: 2px solid var(--line); padding: 0.5rem 0.75rem; margin: 1rem 0; }
ul { padding-left: 1.25rem; }
li { margin: 0.25rem 0; overflow-wrap: anywhere; }
.words { white-space: pre-wrap; }
.note { margin: 0.1rem 0 0 0; font-style: italic; }
@media print { body { background: #fff; color: #000; } .statement { border-color: #000; } }
`;

const text = (value) => xmlEscape(value);

/** @param {ReturnType<import('../domain/export-model.js').buildExportModel>['model']} model */
export function renderHtml(model) {
  const out = [];
  out.push('<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">');
  out.push(`<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`);
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  out.push('<meta name="referrer" content="no-referrer">');
  out.push(`<title>${text(model.title)}</title>`, `<style>${STYLE}</style>`, '</head>', '<body>', '<main>');
  out.push(`<h1>${text(model.title)}</h1>`);
  out.push(`<p>For: ${model.audience === null ? 'Everyone (my own answers)' : text(model.audience)}</p>`);
  out.push(`<p>Prepared on ${text(model.date)}</p>`);
  out.push(`<p class="statement">${text(model.statement)}</p>`);
  out.push('<h2>How to read this</h2>', '<ul>');
  for (const s of model.legend) out.push(`<li><strong>${text(s.label)}</strong>${s.description ? `: ${text(s.description)}` : ''}</li>`);
  out.push('</ul>');
  for (const section of model.sections) {
    out.push(`<h2>${text(section.name)}</h2>`, '<ul>');
    for (const item of section.items) {
      const answer = item.kind === 'state'
        ? `<strong>${text(item.state.label)}</strong>`
        : `<span class="words">${text(item.text.trim() === '' ? '(nothing written)' : item.text)}</span>`;
      const note = item.note ? `<p class="note">Note: ${text(item.note)}</p>` : '';
      out.push(`<li>${text(item.label)}: ${answer}${note}</li>`);
    }
    out.push('</ul>');
  }
  out.push(`<p class="statement">${text(model.statement)}</p>`, '</main>', '</body>', '</html>');
  return `${out.join('\n')}\n`;
}
