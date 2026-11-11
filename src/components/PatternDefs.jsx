// SVG pattern fills for the states that have one, drawn in that state's own text colour (I-09).
/** SVG pattern fills for the states that have one, drawn in that state's own text colour. */
export function PatternDefs({ idBase, states }) {
  const seen = new Map();
  for (const s of states) if (s.pattern && s.pattern !== 'solid') seen.set(`${s.pattern}-${s.textColor}`, s);
  return (
    <defs>
      {[...seen.entries()].map(([key, s]) => (
        <pattern key={key} id={`${idBase}-${key.replace('#', '')}`} patternUnits="userSpaceOnUse" width="8" height="8">
          {s.pattern === 'dots' && <circle cx="4" cy="4" r="1.4" fill={s.textColor} />}
          {s.pattern === 'stripes' && <path d="M-1 9L9 -1M-1 1L1 -1M7 9L9 7" stroke={s.textColor} strokeWidth="1.6" />}
          {s.pattern === 'dashed' && <path d="M0 4H4" stroke={s.textColor} strokeWidth="1.6" />}
        </pattern>
      ))}
    </defs>
  );
}
