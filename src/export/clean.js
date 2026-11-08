// Drops characters that no text format can safely carry (control characters and two reserved code
// points), keeping tab and line breaks. Done with code points rather than a pattern.
export function stripControl(text) {
  let out = '';
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127 && code !== 0xfffe && code !== 0xffff)) out += ch;
  }
  return out;
}
