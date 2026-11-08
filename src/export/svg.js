// SVG export (M4-06). Renders the export model as a standalone picture made only of plain shapes
// and <text> elements in system fonts. No script, no external file, no image, no foreignObject,
// no link. Every state is shown by its words, an icon and a pattern as well as its colour (I-09),
// and the legend and the fixed statement are always in the picture (I-02).
import { ICON_SHAPES, ICON_WORDS } from './icon-paths.js';
import { stripControl } from './clean.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const WIDTH = 840;
const PAD = 24;
const BADGE_W = 190;
const BADGE_H = 30;
const LABEL_W = WIDTH - PAD * 2 - BADGE_W - 16;
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Escape text for XML, and drop characters XML cannot hold. */
export function xmlEscape(text) {
  return stripControl(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const colour = (value, fallback) => (HEX.test(value) ? value : fallback);

/** Break text into lines of about `max` characters, splitting long words, keeping paragraphs. */
export function wrapText(text, max) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > max) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, max));
        word = word.slice(max);
      }
      if (line === '') line = word;
      else if (line.length + 1 + word.length <= max) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.length ? lines : [''];
}

const charsFor = (width, size) => Math.max(8, Math.floor(width / (size * 0.56)));

function icon(name, x, y, size, stroke) {
  const scale = size / 24;
  const shapes = (ICON_SHAPES[name] ?? ICON_SHAPES.circle).map((s) => {
    if (s.circle) return `<circle cx="${s.circle[0]}" cy="${s.circle[1]}" r="${s.circle[2]}"${s.fill ? ` fill="${stroke}"` : ''}/>`;
    return `<path d="${s.d}"/>`;
  }).join('');
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>`;
}

/** One state as a badge: colour fill, pattern, border, icon and words. */
function badge(state, x, y, w, h, patternIds) {
  const bg = colour(state.color, '#FFFFFF');
  const fg = colour(state.textColor, '#1F1F1F');
  const pattern = state.pattern ?? 'solid';
  const overlay = pattern === 'stripes' || pattern === 'dots' ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#${patternIds[pattern]})"/>` : '';
  const dash = pattern === 'dashed' ? ' stroke-dasharray="6 4"' : '';
  const size = h >= 28 ? 14 : 13;
  const label = wrapText(state.label, charsFor(w - 44, size))[0];
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${bg}" stroke="${fg}" stroke-width="2"${dash}/>`,
    overlay,
    icon(state.icon, x + 8, y + (h - 18) / 2, 18, fg),
    `<text x="${x + 34}" y="${y + h / 2 + 5}" font-size="${size}" font-weight="700" fill="${fg}">${xmlEscape(label)}</text>`,
  ].join('');
}

/**
 * @param {ReturnType<import('../domain/export-model.js').buildExportModel>['model']} model
 * @returns {{ svg: string, width: number, height: number }}
 */
export function renderSvg(model) {
  const body = [];
  let y = PAD;
  const text = (x, size, weight, fill, content) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${xmlEscape(content)}</text>`;

  // Heading
  y += 24;
  for (const line of wrapText(model.title, charsFor(WIDTH - PAD * 2, 26))) { body.push(text(PAD, 26, 700, '#1F1F1F', line)); y += 32; }
  y -= 6;
  y += 4; body.push(text(PAD, 15, 400, '#444444', `For: ${model.audience === null ? 'Everyone (my own answers)' : model.audience}`));
  y += 22; body.push(text(PAD, 15, 400, '#444444', `Prepared on ${model.date}`));

  // The statement, in a box, always
  const statement = wrapText(model.statement, charsFor(WIDTH - PAD * 2 - 24, 14));
  const boxH = statement.length * 20 + 20;
  y += 16;
  const boxTop = y;
  body.push(`<rect x="${PAD}" y="${boxTop}" width="${WIDTH - PAD * 2}" height="${boxH}" rx="6" fill="#F4F4F4" stroke="#1F1F1F" stroke-width="1.5"/>`);
  statement.forEach((line, i) => { body.push(`<text x="${PAD + 12}" y="${boxTop + 24 + i * 20}" font-size="14" font-weight="600" fill="#1F1F1F">${xmlEscape(line)}</text>`); });
  y = boxTop + boxH;

  // Legend
  y += 22; body.push(text(PAD, 17, 700, '#1F1F1F', 'How to read this'));
  const patternIds = { stripes: 'p-stripes', dots: 'p-dots' };
  const used = new Set();
  for (const s of model.legend) {
    y += 12;
    body.push(badge(s, PAD, y, BADGE_W, BADGE_H, patternIds));
    if (s.pattern === 'stripes' || s.pattern === 'dots') used.add(s.pattern);
    const meaning = `${s.description || ''}${s.description ? ' ' : ''}(${ICON_WORDS[s.icon] ?? 'symbol'}, ${s.pattern === 'solid' ? 'solid fill' : `${s.pattern} pattern`})`;
    const wrapped = wrapText(meaning, charsFor(WIDTH - PAD * 2 - BADGE_W - 16, 13));
    wrapped.forEach((line, i) => { body.push(`<text x="${PAD + BADGE_W + 16}" y="${y + 19 + i * 17}" font-size="13" fill="#333333">${xmlEscape(line)}</text>`); });
    y += Math.max(BADGE_H, wrapped.length * 17 + 4);
  }

  // Sections
  for (const section of model.sections) {
    y += 34; body.push(text(PAD, 18, 700, '#1F1F1F', section.name));
    body.push(`<line x1="${PAD}" y1="${y + 8}" x2="${WIDTH - PAD}" y2="${y + 8}" stroke="#1F1F1F" stroke-width="1"/>`);
    y += 14;
    for (const item of section.items) {
      const labelLines = wrapText(item.label, charsFor(LABEL_W, 15));
      const textLines = item.kind === 'text' ? wrapText(item.text.trim() === '' ? '(nothing written)' : item.text, charsFor(WIDTH - PAD * 2 - 12, 14)) : [];
      const noteLines = item.note ? wrapText(`Note: ${item.note}`, charsFor(WIDTH - PAD * 2 - 12, 13)) : [];
      const top = y + 12;
      labelLines.forEach((line, i) => { body.push(`<text x="${PAD}" y="${top + 18 + i * 19}" font-size="15" font-weight="600" fill="#1F1F1F">${xmlEscape(line)}</text>`); });
      let rowBottom = top + labelLines.length * 19 + 2;
      if (item.kind === 'state') body.push(badge(item.state, WIDTH - PAD - BADGE_W, top, BADGE_W, BADGE_H, patternIds));
      if (item.kind === 'state' && (item.state.pattern === 'stripes' || item.state.pattern === 'dots')) used.add(item.state.pattern);
      textLines.forEach((line, i) => { body.push(`<text x="${PAD + 12}" y="${rowBottom + 16 + i * 18}" font-size="14" fill="#1F1F1F">${xmlEscape(line)}</text>`); });
      rowBottom += textLines.length * 18;
      noteLines.forEach((line, i) => { body.push(`<text x="${PAD + 12}" y="${rowBottom + 16 + i * 17}" font-size="13" font-style="italic" fill="#444444">${xmlEscape(line)}</text>`); });
      rowBottom += noteLines.length * 17;
      y = Math.max(rowBottom, top + BADGE_H) + 8;
      body.push(`<line x1="${PAD}" y1="${y}" x2="${WIDTH - PAD}" y2="${y}" stroke="#D0D0D0" stroke-width="1"/>`);
    }
  }

  // Closing statement, so a cropped picture still carries it
  y += 26;
  const closing = wrapText(model.statement, charsFor(WIDTH - PAD * 2, 12));
  closing.forEach((line, i) => { body.push(`<text x="${PAD}" y="${y + i * 16}" font-size="12" fill="#444444">${xmlEscape(line)}</text>`); });
  y += closing.length * 16 + PAD - 8;
  const height = Math.ceil(y);

  const defs = [
    used.has('stripes') ? `<pattern id="p-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#000000" stroke-opacity="0.22" stroke-width="3"/></pattern>` : '',
    used.has('dots') ? `<pattern id="p-dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.6" fill="#000000" fill-opacity="0.3"/></pattern>` : '',
  ].join('');

  const summary = `${model.title}. For ${model.audience === null ? 'everyone, using my own answers' : model.audience}. ${model.itemCount} item${model.itemCount === 1 ? '' : 's'}. ${model.statement}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" font-family="${FONT}">`,
    `<title>${xmlEscape(model.title)}</title>`,
    `<desc>${xmlEscape(summary)}</desc>`,
    defs ? `<defs>${defs}</defs>` : '',
    `<rect width="${WIDTH}" height="${height}" fill="#FFFFFF"/>`,
    ...body,
    '</svg>',
  ].join('');
  return { svg, width: WIDTH, height };
}
